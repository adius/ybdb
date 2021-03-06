const path = require('path')

const lowdb = require('lowdb')
const lodash = require('lodash')
const yaml = require('js-yaml')
const fsp = require('fs-extra')
const mainFiles = [
  // Sorted by descending importance
  'main.yaml',
  'index.yaml',
  'data.yaml',
]

class NoYamlError extends Error {
  constructor () {
    super('Directory does not contain a standard YAML file.')
  }
}
const yamlFormat = {
  deserialize: yaml.safeLoad,
  serialize: yaml.safeDump,
}
const yamlPattern = /(ya?ml|json)$/ // JSON is a subset of YAML


function readFileOrDir (nodePath) {
  return fsp
    .readFile(nodePath)
    .then(fileContent => {
      if (!yamlPattern.test(nodePath)) throw new NoYamlError()
      return fileContent
    })
    .catch(error => {
      if (!error.message.includes('EISDIR')) throw error

      return fsp
        .readdir(nodePath)
        .then(subNodeNames => {
          const matches = lodash.intersection(mainFiles, subNodeNames)

          if (!matches.length) throw new NoYamlError()

          const yamlPath = path.join(nodePath, matches[0])
          return fsp.readFile(yamlPath)
        })
    })
}


function readTree (storagePath, deserialize) {
  return fsp
    .readFile(storagePath)
    .then(content => {
      if (!yamlPattern.test(storagePath)) throw new NoYamlError()
      return deserialize(content)
    })
    .catch(error => {
      if (!error.message.includes('EISDIR')) throw error

      return fsp
        .readdir(storagePath)
        .then(nodeNames => nodeNames
          .map(nodeName => readFileOrDir(path.join(storagePath, nodeName))
            .then(fileContent => {
              const fileData = deserialize(fileContent)
              fileData.localId = path
                .basename(nodeName, path.extname(nodeName))
              return fileData
            })
            .catch(loadError => {
              if (loadError instanceof NoYamlError) return
              console.error(`Error in file ${nodeName}`)
              console.error(loadError.reason)
            })
          )
        )
        .then(filePromises => Promise.all(filePromises))
    })
    .then(fileObjects => ({
      [path.basename(storagePath, path.extname(storagePath))]: fileObjects
        .filter(Boolean),
    }))
}


function readTrees (storagePaths) {
  const treePromises = storagePaths
    .map(storagePath =>
      readTree(storagePath, yamlFormat.deserialize)
    )

  return Promise
    .all(treePromises)
    .then(dataObjects => Object.assign({}, ...dataObjects))
}


function joinKeys (object) {
  return [].concat.apply([], Object.values(object))
}

const yamlTreeStorage = {
  read: readTree,
  // write: TODO,
}


const defaultConfig = {
  format: yamlFormat,
  databaseName: 'ybdb',
}

module.exports = class Ybdb {
  constructor (configObject) {
    this.config = configObject
  }

  init () {
    if (!this.config) {
      return Promise.resolve(lowdb())
    }

    const configObject = Object.assign(
      {},
      defaultConfig,
      this.config
    )

    if (configObject.dataLayout) {
      // TODO
    }

    if (configObject.storagePath) {
      configObject.storagePaths = [configObject.storagePath]
    }

    if (configObject.storagePaths) {
      configObject.storage = yamlTreeStorage
      configObject.format = yamlFormat

      return readTrees(configObject.storagePaths)
        .then(data => {
          const db = lowdb(null, configObject)
          if (this.config.joined) data = joinKeys(data)
          db.setState(data)
          return db
        })
    }

    return Promise.resolve(lowdb(
      configObject.storageFile || configObject.databaseName,
      configObject
    ))
  }
}
