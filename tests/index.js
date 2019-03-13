const assert = require('assert')
const mongoose = require('mongoose')
const plugin = require('../index')

describe('tests', function() {
  let model, schema, refSchema, refModel, payload, payloadCard

  before(async function () {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test-database'
    await mongoose.connect(MONGO_URI)

    const Address = new mongoose.Schema({
      number: Number,
      code: {
        type: String,
        access: ['admin']
      }
    })

    const Card = new mongoose.Schema({
      number: {
        type: String,
        private: true
      },
      month: Number,
      year: Number,
    }, {
      id: false
    })

    Card.virtual('display', {
      access: ['admin']
    }).get(function () {
      return this.number.split('-').map(((v, i) => i == 0 ? v : 'XXXX')).join('-')
    })

    schema = new mongoose.Schema({
      name: String,
      password: {
        type: String,
        private: true, // indicates that this field is private, it never returns
      },
      phone: {
        type: String,
        access: ['admin', 'support'], // the `access` the person needs (or) to obtain this fields,
        permissions: ['admin'],
      },
      document: {
        type: String,
        access: ['admin']
      },
      // embedded path
      address: Address,

      // nested embedded with populate
      cards: [{
        title: String,
        card: {
          type: String,
          ref: 'card'
        }
      }],
      
      // simple populaated field
      mainCard: {
        type: String,
        ref: 'card'
      }
    }, {
      id: false
    })

    schema.plugin(plugin)
    model = mongoose.model('test', schema)
    const CardModel = mongoose.model('card', Card)

    payloadCard = {
      number: '4111-1111-1111-1111',
      month: 10,
      year: 2019,
    }

    let card = await CardModel.create(payloadCard)

    payload = {
      name: 'some name',
      password: '123456',
      address: {
        number: 123,
        code: '14940-000'
      },
      cards: [{
        title: 'default',
        card: card._id
      }],
      phone: '(11) 2345-1235',
      document: '123456789',
      mainCard: card._id
    }

    await model.create(payload)
  })

  after(async function () {
    await model.remove({})
    mongoose.connection.close()
  })

  describe('function cloned from mongoose', function () {
    it('does not need testing', async function () {
      await model.find({})
      await model.find(() => {})
      await model.find({}, null, () => {})
      await model.findOne({})
      await model.findOne(() => {})
      await model.findOne({}, null, () => {})
    })
  })

  describe('empty response', function () {
    it('return null on findOne', async function () {
      const resp = await model.findOne({ name: '123' }, null, { filter: true }, () => {})
      assert.equal(resp, null)
    })

    it('return [] on find', async function () {
      const resp = await model.find({ name: '123' }, null, { filter: true }, () => {})
      assert.deepEqual(resp, [])
    })
  })

  describe('unbound query', function () {
    it('return a model on findOne', async function () {
      const resp =  await model.findOne({}, () => {})
      assert('save' in resp)
    })

    it('return a model on find', async function () {
      const resp =  await model.find({}, () => {})
      assert(resp.every(r => 'save' in r))
    })
  })

  describe('should filter correctly', function () {
    describe('when its permissive', function () {
      it('and use findOne and options.filter', async function() {
        const resp = await model
          .findOne({}, null, { filter: true })
          .populate(['cards.card', 'mainCard'])
      
        assert.equal(resp.name, payload.name)
        assert(!('password' in resp))
        assert(!('phone' in resp))
        assert(!('document' in resp))
        // check address
        assert.equal(resp.address.number, payload.address.number)
        assert(!('code' in resp.address))
        // check mainCard
        assert.equal(resp.mainCard.month, payloadCard.month)
        assert.equal(resp.mainCard.year, payloadCard.year)
        assert(!('number' in resp.mainCard))
        assert(!('display' in resp.mainCard))
        // check cards
        assert.equal(resp.cards[0].card.month, payloadCard.month)
        assert.equal(resp.cards[0].card.year, payloadCard.year)
        assert(!('number' in resp.cards[0].card))
        assert(!('display' in resp.cards[0].card))
      })

      it('use find with bound filter', async function() {
        const Model = model.byAccess(['support', 'admin'])
        const [resp] = await Model
          .find({})
          .populate(['cards.card', 'mainCard'])
      
        assert.equal(resp.name, payload.name)
        assert(!('password' in resp))
        assert.equal(resp.phone, payload.phone)
        assert.equal(resp.document, payload.document)
        // check address
        assert.equal(resp.address.number, payload.address.number)
        assert.equal(resp.address.code, payload.address.code)
       
        // check mainCard
        assert.equal(resp.mainCard.month, payloadCard.month)
        assert.equal(resp.mainCard.year, payloadCard.year)
        assert(!('number' in resp.mainCard))
        assert('display' in resp.mainCard)
        // check cards
        assert.equal(resp.cards[0].card.month, payloadCard.month)
        assert.equal(resp.cards[0].card.year, payloadCard.year)
        assert(!('number' in resp.cards[0].card))
        assert('display' in resp.cards[0].card)
      })
    })
  })
})

