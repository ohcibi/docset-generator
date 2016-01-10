let fs = require('fs');
let path = require('path');
let fsx = require('extended-fs');
let Sequelize = require("sequelize");

let isValidString = str => typeof str === 'string' && str.trim().length > 0;

import infoPlistTemplate from './info-plist';

const INFO_PLIST = 'Info.plist';
const ICON = 'icon.png';
const SQLITE_DB = 'docSet.dsidx';
const DOCSET_EXTENSION = '.docset';
const DATABASE_NAME = 'database_name';
const DATABASE_TABLE = 'searchIndex';
const DATABASE_USER = 'username';
const DATABASE_PWD = 'password';
const CONTENTS_PATH = ['Contents'];
const RESOURCES_PATH = ['Contents', 'Resources'];
const DOCUMENTS_PATH = ['Contents', 'Resources', 'Documents'];

export default class DocSetGenerator {
  /**
   * @constructor
   * @param {object} config
   * @param {string} config.destination - Folder in which to create the docSet
   * @param {string} config.documentation - path to the html documentation
   * @param {string} config.name
   * @param {string} [config.identifier]
   * @param {string} [config.index=index.html]
   * @param {string} [config.enableJavascript=false]
   * @param {string} [config.platformFamily]
   * @param {string} [config.icon] - path to the icon
   * @param {Array<{ name:string, type:string, path:string }>} [config.entries]
   */
  constructor({destination, documentation, enableJavascript=false, entries=[], icon, index='index.html', name, identifier=name, platformFamily=name, verbose=false}) {
    if (!fs.existsSync(documentation)) {
      throw Error("Please provide the path to the html documentation (config: documentation)")
    }

    if (!isValidString(name)) {
      throw Error("Please provide a valid name for this docSet (config: name)");
    }

    this.log = (verbose && typeof console === 'object') ? console.log : () => {};

    this.documentation = documentation;
    this.docSetRoot = destination;
    this.icon = icon;
    this.entries = entries;
    // Gathering info needed by Info.plist
    this.docSetInfo = {
      enableJavascript,
      index,
      name,
      identifier,
      platformFamily
    };

    // Normalizing and caching paths to main folders and files
    this.docSetPath = path.join(this.docSetRoot, identifier + DOCSET_EXTENSION);
    this.docSetDocumentsPath = path.join(this.docSetPath, ...DOCUMENTS_PATH);
    this.docSetIconPath = path.join(this.docSetPath, ICON);
    this.docSetSqlitePath = path.join(this.docSetPath, ...RESOURCES_PATH, SQLITE_DB);
    this.docSetInfoPlistPath = path.join(this.docSetPath, ...CONTENTS_PATH, INFO_PLIST);
  }

  /**
   * Create the DocSet
   * @returns {Promise}
   */
  create() {
    this._generateDocSet();
    return this._populateDatabase();
  }

  /**
   * Generate the DocSet
   * @private
   */
  _generateDocSet() {
    if (!fs.existsSync(this.docSetRoot)) {
      fsx.mkdirpSync(this.docSetRoot);
    }
    if (fs.existsSync(this.docSetPath)) {
      this.log("Folder " + this.docSetPath + " already exists. Deleting it...");
      fsx.rmDirSync(this.docSetPath);
      this.log("Folder " + this.docSetPath + " successfully deleted.");
    }
    fsx.mkdirpSync(this.docSetDocumentsPath);
    this.log("Folder Structure " + this.docSetDocumentsPath + " successfully created.");
    this._copyDocumentation();
    this._copyIcon();
    this._createInfoPlist();
    this._createDatabase();
  }

  /**
   * Copy the documentation
   * @private
   */
  _copyDocumentation() {
    fsx.copyDirSync(this.documentation, this.docSetDocumentsPath);
    this.log("HTML Documentation successfully copied to " + this.docSetDocumentsPath + ".");
  };

  /**
   * Copy the icon
   * @private
   */
  _copyIcon() {
    if (fs.existsSync(this.icon)) {
      fs.createReadStream(this.icon)
        .pipe(fs.createWriteStream(this.docSetIconPath));
      this.log(ICON + " successfully copied to DocSet.");
    } else {
      this.log('No icon specified.');
    }
  }

  /**
   * Create the plist file
   * @private
   */
  _createInfoPlist() {
    let writeStream = fs.createWriteStream(this.docSetInfoPlistPath);
    writeStream.write(infoPlistTemplate(this.docSetInfo));
    this.log(INFO_PLIST + " successfully copied to DocSet.");
  }

  /**
   * Create the sqlite database
   * @private
   */
  _createDatabase() {
    this.sequelize = new Sequelize(DATABASE_NAME, DATABASE_USER, DATABASE_PWD, {
      dialect: 'sqlite',
      storage: this.docSetSqlitePath
    });

    this.log("Database " + SQLITE_DB + " successfully created.");
  }

  /**
   * Populate the sqlite database with entries
   * @private
   * @returns {Promise}
   */
  _populateDatabase() {
    let SearchItem = this.sequelize.define(DATABASE_TABLE, {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: Sequelize.STRING,
      type: Sequelize.STRING,
      path: Sequelize.STRING
    }, {
      freezeTableName: true, // otherwise the table is renamed searchIndexes
      timestamps: false
    });

    return this.sequelize
      .sync({ force: true })
      .then(() => SearchItem.bulkCreate(this.entries));
  }
}

export { DocSetGenerator };
