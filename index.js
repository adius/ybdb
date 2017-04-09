const path = require('path')

const lowdb = require('lowdb')
const lodash = require('lodash')
const yaml = require('js-yaml')
const fsp = require('fs-promise')
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

const yamlFilesStorage = {
  read: (storagePath, deserialize) => {
    return fsp
      .readdir(storagePath)
      .then(nodeNames => nodeNames
        .map(nodeName => {
          const nodePath = path.join(storagePath, nodeName)

          return fsp
            .readFile(nodePath)
            .catch(error => {
              if (!error.message.includes('EISDIR')) throw error

              return fsp
                .readdir(path.join(storagePath, nodeName))
                .then(subNodeNames => {
                  const matches = lodash.intersection(mainFiles, subNodeNames)

                  if (!matches.length) throw new NoYamlError()

                  return fsp.readFile(path.join(nodePath, matches[0]))
                })
            })
            .then(fileContent => {
              const fileData = deserialize(fileContent)
              fileData.localId = path
                .basename(nodeName, path.extname(nodeName))
              return fileData
            })
        })
      )
      .then(filePromises => Promise.all(filePromises))
      .then(fileObjects => {
        return {
          [path.basename(storagePath, path.extname(storagePath))]: fileObjects,
        }
      })
      .catch(error => {
        if (!(error instanceof NoYamlError)) throw error
        return {}
      })
  },
}

const yamlFilesFormat = {
  serialize: yaml.safeDump,
  deserialize: yaml.safeLoad,
}

const yamlFormat = {
  deserialize: yaml.safeLoad,
  serialize: yaml.safeDump,
}

const defaultConfig = {
  format: yamlFormat,
  databaseName: 'ybdb',
  storagePath: null,
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

    if (configObject.storagePath) {
      configObject.storage = yamlFilesStorage
      configObject.format = yamlFilesFormat

      return Promise.resolve(lowdb(configObject.storagePath, configObject))
    }

    return Promise.resolve(lowdb(
      configObject.storageFile || configObject.databaseName,
      configObject
    ))
  }
}
