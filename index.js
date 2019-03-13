const mongoose = require('mongoose')
const Filter = require('./filter')
const castArray = require('./helpers').castArray

class MongooseFields {
/**
   * Create a new mongoose filter for a given schema
   *
   * @param {mongoose.Schema} schema
   * @param {Object} [options] - A hash of configuration options.
   */
  constructor(schema, options) {
    this._modelCache = {}
    this._pathsCache = []
    this._publicPathsCache = null
    this._accessPathsCache = {}
    this.schema = schema
    this.options = options || {}
    this.filter = new Filter(this.options)
  }

  traverse(schema, prefix = '', depth = 0) {
    const paths = []
    const maxDepth = 'depth' in this.options ? this.options.depth : 3

    schema && schema.eachPath((name, path) => {
      // refs to another model (i.e: populate)
      if(!!path.options.ref) {
        const refModel = mongoose.model(path.options.ref)
        
        if(depth < maxDepth) {
          paths.push(...this.traverse(refModel.schema, `${prefix + name}.`, depth + 1))
        }
      }

      if(path.instance == 'Array' || path.instance == 'Embedded') {
        paths.push(...this.traverse(path.schema, `${prefix + name}.`, depth))
        return
      }

      const isPrivate = 'private' in path.options ? path.options.private : false

      return paths.push({
        name: prefix + name,
        type: path.instance,
        isRef: !!path.options.ref,
        ref: path.options.ref,
        private: isPrivate,
        access: this.getAccessKey() in path.options ? 
          path.options[this.getAccessKey()] :
          (isPrivate ? 'private' : 'public')
      })
    })

    schema && Object.keys(schema.virtuals).forEach(key => {
      const path = schema.virtuals[key]

      const isPrivate = 'private' in path.options ? path.options.private : false

      paths.push({
        name: prefix + path.path,
        type: undefined,
        isRef: false,
        ref: false,
        private: isPrivate,
        access: this.getAccessKey() in path.options ? 
          path.options[this.getAccessKey()] :
          (isPrivate ? 'private' : 'public')
      })
    })

    return paths
  }

  getAccessPaths(access){
    const cacheKey = castArray(access).sort().join(':')

    if(!(cacheKey in this._accessPathsCache)) {
      this._accessPathsCache[cacheKey] = this.getPaths()
        .filter(p => {
          const permissions = castArray(p[this.getAccessKey()])
          return permissions.some(a => access.includes(a))
        })
        .map(p => p.name)
    }

    return this._accessPathsCache[cacheKey]
  }

  getPublicPaths() {
    const paths = this.getPaths()

    if(this._publicPathsCache == null) {
      this._publicPathsCache = paths
      .filter(p => p.private == false && p[this.getAccessKey()] == 'public')
      .map(p => p.name)
    }

    return this._publicPathsCache
  }

  getPaths() {
    if(this._pathsCache.length == 0) {
      this._pathsCache = this.traverse(this.schema)
    }

    return this._pathsCache
  }

  /**
   * Apply the mongo fields filter plugin to the given schema.
   *
   * @returns {MongooseFields}
   */
  apply() {
    this
      .injectApi()
      .installMiddleWare()
  }

  /**
   * Return the name of the access getter method.
   *
   * @returns {*|string}
   */
  getAccessKey() {
    return this.options.accessKey || 'access'
  }

  /**
   * Return the method name for accessing filtered-bound models.
   *
   * @returns {*|string}
   */
  getAccessorMethod() {
    return this.options.accessorMethod || 'byAccess'
  }

  /**
   * Return the name of the access getter method.
   *
   * @returns {*|string}
   */
  getAccessIdGetter() {
    return this.options.accessIdGetter || 'getAccess'
  }

  /**
   * Inject the user-space entry point for mongo fields.
   * This method adds a static Model method to retrieve access bound sub-classes.
   *
   * @returns {MongooseFilter}
   */
  injectApi() {
    let me = this

    this.schema.statics[this.getAccessorMethod()] = function(access) {
      let modelCache = me._modelCache[this.modelName] || (me._modelCache[this.modelName] = {})

      // lookup access-bound model in cache
      if (!modelCache[access]) {
        let Model = this.model(this.modelName)

        // Cache the access bound model class.
        modelCache[access] = me.createAccessAwareModel(Model, access)
      }

      return modelCache[access]
    }

    return this
  }

  /**
   * Create a model class that is bound to the given access.
   * So that all operations on this model are bound to this access
   *
   * @param BaseModel
   * @param access
   * @returns {MongoAccessModel}
   */
  createAccessAwareModel(BaseModel, access) {
    const me = this
    let accessIdGetter = this.getAccessIdGetter()
    access = castArray(access)

    class MongoAccessModel extends BaseModel {
      static get hasAccessContext() {
        return true
      }

      static [accessIdGetter]() {
        return access
      }
    }

    // inherit all static properties from the mongoose base model
    for (let staticProperty of Object.getOwnPropertyNames(BaseModel)) {
      if (MongoAccessModel.hasOwnProperty(staticProperty)
      || ['arguments', 'caller'].indexOf(staticProperty) !== -1
      ) {
        continue
      }

      let descriptor = Object.getOwnPropertyDescriptor(BaseModel, staticProperty)
      Object.defineProperty(MongoAccessModel, staticProperty, descriptor)
    }

    // create access models for discriminators if they exist
    if (BaseModel.discriminators) {
      MongoAccessModel.discriminators = {}

      for (let key in BaseModel.discriminators) {
        MongoAccessModel.discriminators[key] = this.createAccessAwareModel(BaseModel.discriminators[key], access)
      }
    }

    return MongoAccessModel
  }


  /**
   * Install schema middleware to apply access filters
   *
   * @returns {MongooseFilter}
   */
  installMiddleWare() {
    let
      me = this,
      accessIdGetter = this.getAccessIdGetter()

    this.schema.statics.find = function(conditions, projection, options, callback) {
      if (typeof conditions === 'function') {
        callback = conditions;
        conditions = {};
        projection = null;
        options = null;
      } else if (typeof projection === 'function') {
        callback = projection;
        projection = null;
        options = null;
      } else if (typeof options === 'function') {
        callback = options;
        options = null;
      }

      return mongoose.Model.find.apply(this, arguments).map(docs => {
        if(docs && docs.length == 0) {
          return docs
        }

        if(this.hasAccessContext || (options && options.filter)) {
          const paths = me.getPublicPaths()
          paths.push(...me.getAccessPaths('public'))

          if(this.hasAccessContext) {
            const access = this[accessIdGetter]()
            paths.push(...me.getAccessPaths(access))
          }

          return me.filter.pick(docs, paths)
        }

        return docs
      })
    }

    this.schema.statics.findOne = function(conditions, projection, options, callback) {
      if (typeof conditions === 'function') {
        callback = conditions;
        conditions = {};
        projection = null;
        options = null;
      } else if (typeof projection === 'function') {
        callback = projection;
        projection = null;
        options = null;
      } else if (typeof options === 'function') {
        callback = options;
        options = null;
      }

      return mongoose.Model.findOne.apply(this, arguments).map(doc => {
        if(doc == null) {
          return doc
        }

        if(this.hasAccessContext || (options && options.filter)) {
          const paths = me.getPublicPaths()
          paths.push(...me.getAccessPaths('public'))

          if(this.hasAccessContext) {
            const access = this[accessIdGetter]()
            paths.push(...me.getAccessPaths(access))
          }

          return me.filter.pick(doc, paths)
        }

        return doc        
      })
    }
  }
}

/**
 * The mongoose-fields-filter plugin.
 *
 * @param {mongoose.Schema} schema
 * @param {Object} options
 */
function mongooseFieldsPlugin(schema, options) {
  let mongooseFields = new MongooseFields(schema, options)
  mongooseFields.apply()
}

mongooseFieldsPlugin.MongooseFields = MongooseFields

module.exports = mongooseFieldsPlugin