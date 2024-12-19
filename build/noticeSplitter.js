#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const p = require('process');
const readline = require('readline');

// Default paths
const repoRoot = path.resolve(__dirname, '..');
const noticeFileFQN = process.argv[2] || path.resolve(os.userInfo().homedir, 'Downloads', 'NOTICE.txt');
const summaryFile = path.resolve(repoRoot, 'out', 'noticeSplitterResults.txt');

// Define output files for npm and nuget notices
const nugetNoticeFiles = [path.resolve(repoRoot, 'nuget_NOTICE.txt')];
const npmNoticeFiles = [path.resolve(repoRoot, 'npm_NOTICE.txt')];

// Splitter class
class Splitter {
  #reader;
  #sourceNoticeFile;
  #noticeHeader;
  #npmNotices = [];
  #npmLicenseTitle;
  #nugetNotices = [];
  #nugetLicenseTitle;
  #readingTopHeader = true;
  #compType;
  #buffer = [];
  #totalCompsFound = 0;
  #lineNr = 0;
  #numSepLinesFound = 0;

  constructor(noticeFile) {
    this.#compType = CompTypeEnum.Unknown;
    this.#sourceNoticeFile = noticeFile;
  }

  run() {
    if (!fs.existsSync(this.#sourceNoticeFile)) {
      console.error(`Error: The file ${this.#sourceNoticeFile} does not exist.`);
      process.exit(1);
    }

    this.#reader = readline.createInterface({
      input: fs.createReadStream(this.#sourceNoticeFile),
      stdout: p.stdout,
      terminal: false
    });

    this.#reader.on('line', (line) => this.processLine(line));
    this.#reader.on('close', () => this.createNoticeFiles());
  }

  processLine(line) {
    this.#lineNr += 1;
    this.#buffer.push(line.trimEnd());
    if (this.#readingTopHeader) {
      this.processHeader(line);
    } else {
      this.processNotice(line);
    }
  }

  processHeader(line) {
    if (this.isSeparator(line)) {
      this.#readingTopHeader = false;
      const header = this.#buffer.join(os.EOL);
      this.#noticeHeader = header;

      this.#buffer = [];
      this.#buffer.push(line);
    }
  }

  processNotice(line) {
    if (this.#compType.name === CompTypeEnum.Unknown.name) {
      if (!this.isSeparator(line)) {
        this.#compType = this.determineCompType(line);
      }
    }
    if (this.#compType.name !== CompTypeEnum.Unknown.name) {
      if (this.isLicenseSeparator(line)) {
        const lastSep = this.#buffer.pop();
        const licenseBody = this.#buffer.join(os.EOL);
        if (this.#compType.name === CompTypeEnum.Npm.name) {
          this.#npmNotices.push({ title: this.#npmLicenseTitle, body: licenseBody });
        } else if (this.#compType.name === CompTypeEnum.Nuget.name) {
          this.#nugetNotices.push({ title: this.#nugetLicenseTitle, body: licenseBody });
        }
        this.#totalCompsFound += 1;
        this.#buffer = [];
        this.#buffer.push(lastSep);
        this.#compType = CompTypeEnum.Unknown;
      }
    }
  }

  isSeparator(line) {
    const separatorStart = '-----------------------------------------------------';
    return line.trimStart().startsWith(separatorStart);
  }

  isLicenseSeparator(line) {
    if (this.isSeparator(line)) {
      this.#numSepLinesFound += 1;
      if (this.#numSepLinesFound === 2) {
        this.#numSepLinesFound = 0;
        return true;
      }
    } else {
      if (this.#numSepLinesFound > 0 && line.trim().length > 0) {
        this.#numSepLinesFound = 0;
      }
    }
    return false;
  }

  determineCompType(line) {
    line = line.trimStart();
    if (line.length > 0) {
      const firstChar = line[0];
      const compType = (firstChar.toLowerCase() === firstChar || firstChar === '@') ? CompTypeEnum.Npm : CompTypeEnum.Nuget;
      if (compType.name === CompTypeEnum.Npm.name) {
        this.#npmLicenseTitle = line.trimEnd();
      } else if (compType.name === CompTypeEnum.Nuget.name) {
        this.#nugetLicenseTitle = line.trimEnd();
      }
      return compType;
    } else {
      return CompTypeEnum.Unknown;
    }
  }

  createNoticeFiles() {
    const summary = [
      `total components: ${this.#totalCompsFound} (parsed ${this.#lineNr} lines)`,
      `npm components  : ${this.#npmNotices.length}`,
      `nuget components: ${this.#nugetNotices.length}`,
    ];

    summary.slice(0, 3).forEach(line => console.log(line));

    this.#npmNotices = this.#npmNotices.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    const npmNotice = [this.#noticeHeader].concat(this.#npmNotices.map(n => n.body)).join(os.EOL);
    npmNoticeFiles.forEach(fileName => {
      console.log(`writing npm notice file: ${fileName}`);
      fs.writeFileSync(fileName, npmNotice, { encoding: 'utf8' });
    });

    this.#nugetNotices = this.#nugetNotices.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    const nugetNotice = [this.#noticeHeader].concat(this.#nugetNotices.map(n => n.body)).join(os.EOL);
    nugetNoticeFiles.forEach(fileName => {
      console.log(`writing nuget notice file: ${fileName}`);
      fs.writeFileSync(fileName, nugetNotice, { encoding: 'utf8' });
    });

    const summarySectionSep = '=============';
    summary.push(os.EOL);
    summary.push('npm package titles found:');
    summary.push(summarySectionSep);
    summary.push(...this.#npmNotices.map(n => n.title).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    summary.push(os.EOL);
    summary.push('nuget package titles found:');
    summary.push(summarySectionSep);
    summary.push(...this.#nugetNotices.map(n => n.title).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));

    fs.mkdirSync(path.dirname(summaryFile), { recursive: true });
    fs.writeFileSync(summaryFile, summary.join(os.EOL));
    console.log(`summary file written to: ${summaryFile}`);
    console.log('DONE!');
  }
}

class CompTypeEnum {
  name;
  static Unknown = new CompTypeEnum('Unknown');
  static Npm = new CompTypeEnum('Npm');
  static Nuget = new CompTypeEnum('Nuget');

  constructor(name) {
    this.name = name;
  }

  toString() {
    return this.name;
  }
}

// Execute the script
const splitter = new Splitter(noticeFileFQN).run();
