import { DefaultResource } from './default'
import { register as jpdefine } from 'jsonpolice';

jpdefine('MongoResourceOptions', {
  value: {
    db: {
      type: 'string',
      required: true
    },
    collection: {
      type: 'string',
      required: true
    }
  }
}, 'ResourceOptions');

export class MongoResource extends DefaultResource {
  constructor(_options) {
    super(_options, 'MongoResourceOptions');
  }
  query(req, res) {
    res.send('query');
  }
  read(req, res) {
    console.log('mongo hi!');
    res.send('get ' + req.params.id);
  }
  create(req, res) {
    res.send('create');
  }
  updateAll(req, res) {
    res.send('updateAll');
  }
  updateOne(req, res) {
    res.send('updateOne');
  }
  deleteAll(req, res) {
    res.send('deleteAll');
  }
  deleteOne(req, res) {
    res.send('query');
  }
}
