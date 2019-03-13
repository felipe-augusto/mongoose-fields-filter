# Mongoose Fields Filter

## About

Mongoose plugin that provides private paths and custom permissions filtering

## Requirements

Mongo Fields Filter is compatible with mongoose 5.

## Install

```sh
$ npm i -S mongo-fields-filter
// or
$ yarn add mongo-fields-filter
```

## Use

Register the plugin on the relevant mongoose schema.

```javascript
const mongoose = require('mongoose');
const mongoFields = require('mongoose-fields-filter');

const MySchema = new mongoose.Schema({});
MySchema.plugin(mongoFields);

const MyModel = mongoose.model('MyModel', MySchema);
```

Specify which fields are `private` and which `access` a person must has to retrieve the field:


```javascript
const UserSchema = new mongoose.Schema({
  name: String,
  password: {
    type: String,
    private: true, // indicates that this field is private, it never returns
  },
  phone: {
    type: String,
    access: ['admin', 'support'] // the `access` the person needs (or) to obtain this fields
  },
  document: {
    type: String,
    access: ['admin']
  }
})

```

Scope query by passing which `access` you want the query to have, and then make the query:

```
const AccessBoundModel = UserModel.byAccess(['support', 'financial'])
const user = AccessBoundModel.findOne({})
// filtering works here
{
  name: 'Some name',
  phone: '(11) 1234-5678'
}

```


### Configuration

Everything works out of the box, but you can customize as follows:

```javascript
const config = {
  /**
   * If you want to include virtuals
   */
  virtuals: true,

  /**
   * Max depth allowed when using recursive populate
   */
  depth: 3,

  /**
   * The field that the plugin will look in the model in order
   * to find which permissions are necessary
   */
  accessKey: 'access',

  /**
   * The name of the filter bound model getter method
   */
  accessorMethod: 'byAccess',

  /**
   * The name of the access getter method
   */
  accessIdGetter: 'getAccess'
};

SomeSchema.plugin(schema, config);
```


### LICENSE

The files in this archive are released under MIT license.
You can find a copy of this license in [LICENSE]().