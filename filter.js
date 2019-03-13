const _pick = require('lodash.pick')

module.exports = class Filter {
  constructor(opts = {}) {
    this.virtuals = 'virtuals' in opts ? opts.virtuals : true
  }

  isObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]'
  }

  // this function receives an object and the fields it should pick
  pick(obj, fields) {
    // append prefixes
    fields.push(...fields.map(a => a.split('.')[0]))

    // we reached a leaf, need to return
    if(fields == null || (Array.isArray(fields) && fields.length == 0)) {
      return obj
    }

    // if passing an array, call pick for each item
    if(Array.isArray(obj)) {
      return obj.map(a => this.pick(a, fields))
    }

    if(this.isObject(obj)) {
      if(obj.toObject instanceof Function) obj = obj.toObject({ virtuals: this.virtuals })

      // filter the object
      obj = _pick(obj, fields)

      // iterate on object keys
      Object.keys(obj).forEach(key => {
        const nestedFields = fields
          .filter(f => f.startsWith(`${key}.`))
          .map(f => f.replace(new RegExp(`^${key}\\.`),''))
        
        // if it's an array, filter each item of the array
        if(Array.isArray(obj[key])) {
          obj[key] = obj[key].map(item => this.pick(item, nestedFields))
        } else {
          obj[key] = this.pick(obj[key], nestedFields)
        }
      })
    }

    return obj
  }
}