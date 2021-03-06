const expect = require('unexpected')
const Ybdb = require('../index.js')

async function runTest () {
  process.stdout.write('Main test')
  const database = new Ybdb()
  const initializedDb = await database.init()

  initializedDb
    .defaults({
      contacts: [
        {name: 'John', age: 45},
        {name: 'Anna', age: 34},
      ],
    })
    .write()

  const retrievedAge = initializedDb
    .get('contacts')
    .find({name: 'Anna'})
    .value()
    .age

  expect(retrievedAge, 'to equal', 34)
  console.info(' ✔︎')
}

runTest()
