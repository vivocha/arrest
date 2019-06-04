import * as chai from 'chai';
import { rebaseOASDefinitions, refsRebaser } from '../../dist/utils';
import { complexSpec, multiDefSpec, multiNestedSameNameDefSpec, nestedDefinitionsSpec, nestedSameNameDefSpec, simpleSpec } from './specs';

const should = chai.should();

describe('utils', function() {
  describe('refsRebaser() function ', function() {
    it('should return an obj with $ref as <ext_schema_name>#/definitions/<schema_name> rebased to OAS #/components/schemas/<ext_schema_name>/definitions/<schema_name>', function() {
      const obj = { $ref: 'global#/definitions/nonEmptyString' };
      const rebased = refsRebaser('global', obj);
      rebased.$ref.should.equal('#/components/schemas/global/definitions/nonEmptyString');
    });
    it('should return an obj with $ref as #/definitions/<schema_def_name> rebased to OAS #/components/schemas/<schema_name>/definitions/<schema_def_name>', function() {
      const obj = { $ref: '#/definitions/a' };
      const rebased = refsRebaser('my_schema', obj);
      rebased.$ref.should.equal('#/components/schemas/my_schema/definitions/a');
    });
    it('should return an obj with $ref as <ext_schema_name>#/properties/<prop_name> rebased to OAS #/components/schemas/<ext_schema_name>/properties/<prop_name>', function() {
      const obj = { $ref: 'global#/properties/a' };
      const rebased = refsRebaser('must_be_unused', obj);
      rebased.$ref.should.equal('#/components/schemas/global/properties/a');
    });
    it('should return an obj with $ref as #/properties/<prop_name> rebased to OAS #/components/schemas/<schema_name>/definitions/<prop_name>', function() {
      const obj = { $ref: '#/properties/a' };
      const rebased = refsRebaser('my_schema', obj);
      rebased.$ref.should.equal('#/components/schemas/my_schema/properties/a');
    });
    it('should return an obj with $ref as <ext_schema_name># rebased to OAS #/components/schemas/<ext_schema_name>', function() {
      const obj = { $ref: 'global#' };
      const rebased = refsRebaser('unused_name', obj);
      rebased.$ref.should.equal('#/components/schemas/global');
    });
    it('should return an obj with $ref as <ext_schema_name> rebased to OAS #/components/schemas/<ext_schema_name>', function() {
      const obj = { $ref: 'global' };
      const rebased = refsRebaser('unused_name', obj);
      rebased.$ref.should.equal('#/components/schemas/global');
    });
    it('should leave absolute urls unchanged (http)', function() {
      debugger;
      const obj = { $ref: 'http://example.com' };
      const rebased = refsRebaser('unused_name', obj);
      rebased.$ref.should.equal('http://example.com');
    });
    it('should leave absolute urls unchanged (https)', function() {
      debugger;
      const obj = { $ref: 'https://example.com' };
      const rebased = refsRebaser('unused_name', obj);
      rebased.$ref.should.equal('https://example.com');
    });
  });
  describe('rebaseOASDefinitions() for a spec containing schemas with first-level definitions', function() {
    it('for a simple spec, it should return the spec with moved definitions in #/components/schemas and $refs updated accordingly', function() {
      const rebased = rebaseOASDefinitions(simpleSpec);
      const expectedSpec = {
        openapi: '3.0.2',
        info: { title: 'Test Server REST API v3', version: '7.0.0-dev1' },
        components: {
          schemas: {
            a_valueInterval: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, additionalProperties: false },
            a_timeInterval: {
              type: 'object',
              description: 'Describes an interval of time as a possibly recurring pattens',
              properties: {
                minutes: { $ref: '#/components/schemas/a_valueInterval' },
                hours: { $ref: '#/components/schemas/a_valueInterval' },
                dayOfMonth: { $ref: '#/components/schemas/a_valueInterval' },
                dayOfWeek: { $ref: '#/components/schemas/a_valueInterval' },
                month: { $ref: '#/components/schemas/a_valueInterval' },
                year: { $ref: '#/components/schemas/a_valueInterval' }
              },
              additionalProperties: false
            },
            a_a1: {
              type: 'object',
              description: 'a1',
              properties: {
                intervals: { type: 'array', items: { $ref: '#/components/schemas/a_timeInterval' } },
                exceptions: { type: 'array', items: { $ref: '#/components/schemas/a_timeInterval' } }
              },
              additionalProperties: false
            },
            a: {
              description: 'Test',
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                  description: 'short description'
                },
                description: {
                  type: 'string',
                  description: 'description'
                }
              }
            }
          }
        }
      };
      //console.log('REBASED:');
      //console.dir(rebased, { colors: true, depth: 20 });
      rebased.should.deep.equal(expectedSpec);
    });
    it('for a complex spec, it should return the spec with moved definitions in #/components/schemas and $refs updated accordingly', function() {
      const rebased = rebaseOASDefinitions(complexSpec);
      const expectedSpec = {
        openapi: '3.0.2',
        info: { title: 'Test Server REST API v3 complete, as created by ARREST', version: '7.0.0-dev1' },
        components: {
          schemas: {
            metadata: { type: 'object' },
            objectId: { type: 'string' },
            errorResponse: {
              type: 'object',
              properties: { error: { type: 'integer', minimum: 100 }, message: { type: 'string' }, info: { type: 'string' } },
              required: ['error', 'message']
            },
            global: {},
            common: {},
            a_all: {
              type: 'object',
              oneOf: [{ $ref: '#/components/schemas/a' }, { $ref: '#/components/schemas/a_remote' }]
            },
            a_remote: {
              type: 'object',
              properties: {
                id: { $ref: '#/components/schemas/a/properties/id' },
                wwww: { $ref: '#/components/schemas/a/properties/wwww' },
                remote: { type: 'boolean', enum: [true] }
              },
              required: ['id', 'wwww', 'remote']
            },
            a_update: {
              type: 'object',
              properties: {
                id: { $ref: '#/components/schemas/a/properties/id' },
                wwww: { $ref: '#/components/schemas/a/properties/wwww' },
                pfl: { $ref: '#/components/schemas/a/properties/pfl' },
                country: { $ref: '#/components/schemas/a/properties/country' },
                macros: { $ref: '#/components/schemas/a/properties/macros' },
                groups: { $ref: '#/components/schemas/a/properties/groups' },
                status: { $ref: '#/components/schemas/a/properties/status' },
                llls: { $ref: '#/components/schemas/a/properties/llls' },
                timezone: { $ref: '#/components/schemas/a/properties/timezone' },
                default_language: { $ref: '#/components/schemas/a/properties/default_language' },
                owner: { $ref: '#/components/schemas/a/properties/owner' },
                blggg: { $ref: '#/components/schemas/a/properties/blggg' },
                rrtn: { $ref: '#/components/schemas/a/properties/rrtn' },
                itys: { $ref: '#/components/schemas/a/properties/itys' },
                buss: { $ref: '#/components/schemas/a/properties/buss' },
                yyy: { $ref: '#/components/schemas/a/properties/yyy' },
                settings: { $ref: '#/components/schemas/a/properties/settings' },
                geoip: { $ref: '#/components/schemas/a/properties/geoip' },
                alarms: { $ref: '#/components/schemas/a/properties/alarms' }
              },
              required: ['id', 'wwww', 'country', 'status', 'timezone', 'default_language', 'owner', 'blggg']
            },
            a: {
              type: 'object',
              properties: {
                id: { type: 'string', minLength: 3, maxLength: 16, pattern: '[a-zA-Z0-9]*' },
                wwww: { type: 'string' },
                pfl: { type: 'string' },
                remote: {
                  type: 'boolean',
                  enum: [false],
                  default: false
                },
                creation_ts: { type: 'string', format: 'date-time' },
                country: { type: 'string' },
                logo: { type: 'string', format: 'uri' },
                macros: {
                  type: 'array',
                  'x-summary': 'content',
                  items: {
                    type: 'object',
                    properties: {
                      key: {
                        type: 'integer',
                        default: 1,
                        minimum: 1
                      },
                      type: { type: 'string', enum: ['text', 'link'], default: 'text' },
                      abbreviation: {
                        type: 'string',
                        minLength: 2
                      },
                      content: { type: 'string', minLength: 3 },
                      autorun: { type: 'boolean', default: false },
                      tags: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['abbreviation', 'content']
                  }
                },
                groups: {
                  type: 'array',
                  'x-summary': 'name',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      priority: { type: 'number', default: 15, minimum: 1, maximum: 30 },
                      tags: { type: 'array', items: { type: 'string' } }
                    },
                    required: ['name', 'tags']
                  }
                },
                status: {
                  type: 'string',
                  default: 'active',
                  enum: ['active', 'inactive']
                },
                llls: { allOf: [{ $ref: '#/components/schemas/llls' }] },
                timezone: { allOf: [{ $ref: '#/components/schemas/timezone' }] },
                default_language: {
                  allOf: [{ $ref: '#/components/schemas/language' }]
                },
                owner: {
                  type: 'string'
                },
                owner_email: { 'x-group': 'general', type: 'string', writeOnly: true },
                owner_mega: {
                  'x-group': 'general',

                  type: 'string',
                  minLength: 8,
                  writeOnly: true
                },
                blggg: {
                  type: 'object',
                  properties: {
                    mode: {
                      type: 'string',
                      enum: ['auto', 'manual'],
                      default: 'manual'
                    },
                    version: { type: 'integer', enum: [2], default: 2 },
                    info: {
                      type: 'object',
                      properties: { email: { type: 'string', format: 'email' } },
                      required: ['email']
                    },
                    last_check: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] }
                  },
                  required: ['mode', 'info', 'version']
                },
                rrtn: {
                  type: 'object',
                  properties: {
                    idleChatTimeout: {
                      type: 'integer',
                      minimum: 60,
                      maximum: 600,
                      default: 60
                    },
                    steps: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
                    delay: {
                      type: 'integer',
                      minimum: 5,
                      maximum: 300,
                      default: 12
                    },
                    ghts: {
                      type: 'object',
                      properties: {
                        load: { type: 'number', minimum: 0, maximum: 1, default: 0 },
                        idle: { type: 'number', minimum: 0, maximum: 1, default: 0 },
                        tags: { type: 'number', minimum: 0, maximum: 1, default: 0 }
                      },
                      default: {},
                      additionalProperties: false
                    },
                    showWaitingsOnPause: {
                      type: 'boolean',
                      default: true
                    },
                    forcedPause: {
                      type: 'boolean',
                      default: false
                    }
                  },
                  additionalProperties: false
                },
                itys: {
                  type: 'object',
                  properties: {
                    goodboy: {
                      type: 'string',
                      enum: ['none', 'e', 'server'],
                      default: 'none'
                    },
                    datagoodboy: {
                      type: 'string',
                      enum: ['none', 'all'],
                      default: 'none'
                    },
                    keyManager: {
                      type: 'string',
                      enum: ['internal', 'external'],
                      default: 'internal'
                    },
                    keyManagerURL: { type: 'string', format: 'uri' },
                    megaPolicy: {
                      type: 'object',
                      properties: {
                        pwdlength: { type: 'integer', minimum: 7, default: 7 },
                        userNinPwd: { type: 'boolean', default: false },
                        lower: { type: 'boolean', default: false },
                        upper: { type: 'boolean', default: false },
                        digit: { type: 'boolean', default: false },
                        nonWord: { type: 'boolean', default: false }
                      },
                      default: {}
                    }
                  },
                  'x-dependencies': { keyManagerURL: ['keyManager'] }
                },
                buss: {
                  type: 'array',
                  summary: 'parent',
                  items: { $ref: '#/components/schemas/a_bus' },
                  default: []
                },
                bus: {
                  'x-group': 'blggg',

                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    parent: { allOf: [{ $ref: '#/components/schemas/anp_id' }] },
                    validity: { allOf: [{ $ref: '#/components/schemas/global_validity' }] },
                    llls: { $ref: '#/components/schemas/a/properties/llls' },
                    pingPongs: {
                      allOf: [{ $ref: '#/components/schemas/anp_bucket/properties/total' }]
                    },
                    littleBy: {
                      allOf: [{ $ref: '#/components/schemas/anp_bucket/properties/total' }]
                    }
                  },
                  required: ['parent'],
                  writeOnly: true
                },
                redddd: {
                  type: 'object',
                  properties: {
                    azerty: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          sub_id: { type: 'string' },
                          type: { type: 'string', enum: ['pingPongs', 'littleBy'] },
                          total: { allOf: [{ $ref: '#/components/schemas/global_infiniteOrPositiveNumber' }] },
                          validity: { allOf: [{ $ref: '#/components/schemas/global_validity' }] },
                          priority: {
                            type: 'number',
                            minimum: 0,
                            default: 50
                          },
                          min: { allOf: [{ $ref: '#/components/schemas/global_infiniteOrPositiveNumber' }] },
                          ts: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] },
                          initial: {
                            allOf: [{ $ref: '#/components/schemas/global_positiveInteger' }]
                          }
                        }
                      }
                    },
                    totals: {
                      type: 'object',
                      properties: {
                        pingPongs: { allOf: [{ $ref: '#/components/schemas/a_total' }] },
                        littleBy: { allOf: [{ $ref: '#/components/schemas/a_total' }] }
                      }
                    }
                  }
                },
                yyy: {
                  type: 'object',
                  properties: {
                    ga: { type: 'boolean', default: false },
                    webtrends: { type: 'boolean', default: false }
                  },
                  default: {}
                },
                settings: {
                  type: 'object',
                  properties: {
                    reports: {
                      type: 'object',
                      properties: {
                        format: { type: 'string', enum: ['csv', 'xslx'], default: 'xslx' },
                        separator: {
                          type: 'string',
                          enum: ['semicolon_period', 'comma_period', 'semicolon_comma']
                        }
                      }
                    },
                    rrhh: {
                      type: 'object',
                      properties: {
                        auto: { type: 'boolean', default: false },
                        meme: {
                          type: 'object',
                          properties: {
                            smartiesIn: { type: 'boolean', default: true },
                            smartiesOut: { type: 'boolean', default: true },
                            creamIn: { type: 'boolean', default: true },
                            creamOut: { type: 'boolean', default: true }
                          }
                        },
                        donald: {
                          type: 'object',
                          properties: {
                            start: { type: 'boolean', default: true },
                            stop: { type: 'boolean', default: true },
                            meme: { type: 'boolean', default: true }
                          }
                        }
                      }
                    }
                  }
                },
                geoip: {
                  type: 'object',
                  properties: {
                    country_code: { $ref: '#/components/schemas/country' },
                    country_code3: { type: 'string' },
                    country_name: { type: 'string' },
                    latitude: { type: 'number' },
                    longitude: { type: 'number' },
                    continent_code: { enum: ['AF', 'AN', 'EU', 'NA', 'SA', 'AS', 'OC'], type: 'string' },
                    ip: { type: 'string' },
                    region: { type: 'string' },
                    city: { type: 'string' },
                    postal_code: { type: 'string' },
                    metro_code: { type: 'number' },
                    dma_code: { type: 'number' },
                    area_code: { type: 'number' },
                    time_zone: { $ref: '#/components/schemas/timezone' }
                  }
                },
                alarms: {
                  type: 'array',
                  items: {
                    properties: {
                      type: { type: 'string' },
                      ts: { format: 'date-time', type: 'string' },
                      data: { type: 'object' }
                    },
                    required: ['type', 'ts'],
                    type: 'object'
                  }
                }
              },
              required: ['id', 'wwww', 'country', 'status', 'timezone', 'default_language', 'owner', 'owner_email', 'owner_mega', 'bus', 'blggg']
            },
            b: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: {}
            },
            c: {
              type: 'object',
              required: ['id', 'jojo'],
              allOf: [{ $ref: '#/components/schemas/global_canBeDisabled' }, { $ref: '#/components/schemas/global_hasaId' }],
              properties: {
                id: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                description: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                defaultLanguage: { $ref: '#/components/schemas/global_languageId' },
                nickname: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                pic: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                tags: { allOf: [{ $ref: '#/components/schemas/global_arrayOfStrings' }] },
                todoListId: { type: 'string' },
                videogameInfo: {
                  type: 'object',

                  minProperties: 1,
                  properties: { todonald: { $ref: '#/components/schemas/global_keyMatch' }, toTags: { $ref: '#/components/schemas/global_keyMatch' } }
                },
                jojo: {
                  type: 'object',
                  description: '',
                  minProperties: 1,
                  'x-patternProperties': { '^([a-z]{2,3})(-[A-Z]{2})?$': { $ref: '#/components/schemas/global_nonEmptyString' } }
                }
              }
            },
            d: {
              type: 'object',
              required: ['name', 'languages', 'defaultLanguage', 'meme', 'chhs'],
              allOf: [
                { $ref: '#/components/schemas/global_hasaId' },
                { $ref: '#/components/schemas/global_supportsDraft' },
                { $ref: '#/components/schemas/global_canBeDisabled' },
                { $ref: '#/components/schemas/d_commonSettings' }
              ],
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                languages: {
                  type: 'array',

                  items: { $ref: '#/components/schemas/global_languageId' }
                },
                defaultLanguage: { $ref: '#/components/schemas/global_languageId' },
                validity: {
                  type: 'object',

                  properties: {
                    from: { type: 'string', format: 'date-time' },
                    to: { type: 'string', format: 'date-time' }
                  },
                  additionalProperties: false
                },
                jimmy: { $ref: '#/components/schemas/d_jimmy' },
                _chhs: {
                  type: 'object',
                  properties: { web: { $ref: '#/components/schemas/d_webchh' } },
                  additionalProperties: { $ref: '#/components/schemas/d_chh' }
                },
                hash: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { readOnly: true }] }
              }
            },
            e: {
              type: 'object',
              required: ['id', 'scope'],
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: {
                id: {
                  type: 'string',
                  minLength: 64,
                  readOnly: true
                },
                amazingWow: {
                  type: 'string',
                  minLength: 64,
                  readOnly: true
                },
                description: { type: 'string' },
                redirect_uri: {
                  type: 'string',
                  format: 'url'
                },
                scope: {
                  type: 'array',
                  items: { type: 'string', pattern: '^[-]?([\\*]|\\w*)(.([\\*]|\\w*))?$' }
                },
                user_id: {
                  type: 'string'
                }
              }
            },
            ccc: {
              type: 'object',
              required: ['dId', 'version', 'chhId', 'eppId', 'mpr'],
              additionalProperties: false,
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: {
                dId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                version: { type: 'number', writeOnly: true },
                chhId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                eppId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                gagId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                mpr: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                data: { allOf: [{ $ref: '#/components/schemas/ccc_todoList' }, { writeOnly: true }] },
                lang: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                color: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                tags: { allOf: [{ $ref: '#/components/schemas/global_arrayOfStrings' }, { writeOnly: true }] },
                optionalTags: { allOf: [{ $ref: '#/components/schemas/global_arrayOfStrings' }, { writeOnly: true }] },
                assignmentTags: { allOf: [{ $ref: '#/components/schemas/global_arrayOfStrings' }, { writeOnly: true }] },
                uuuu: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                uuut: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                nick: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                first_uri: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                first_title: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                ext_id: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                info: {},
                mobile: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }, { writeOnly: true }] },
                cccchh: { allOf: [{ $ref: '#/components/schemas/ccc_cccchh' }, { writeOnly: true }] },
                debug: { type: 'boolean', default: false, writeOnly: true }
              }
            },
            c_message: {
              type: 'object',
              properties: {
                data: {
                  type: 'object',

                  additionalProperties: { not: { anyOf: [{ type: 'object' }, { type: 'array' }] } }
                },
                language: { $ref: '#/components/schemas/common_languageCode' },
                context: { type: 'object' },
                tempContext: { type: 'object' },
                settings: {
                  type: 'object',
                  properties: {
                    engine: {
                      type: 'object',

                      required: ['type'],
                      properties: {
                        type: { type: 'string', minLength: 1 },
                        auth: {
                          type: 'object',

                          required: ['type', 'amazingWow'],
                          properties: {
                            type: { $ref: '#/components/schemas/common_notEmptyString' },
                            amazingWow: { $ref: '#/components/schemas/common_notEmptyString' }
                          },
                          oneOf: [
                            { type: 'object', properties: { type: { enum: ['bearer'] } } },
                            {
                              type: 'object',
                              required: ['xyz'],
                              properties: { type: { enum: ['basic'] }, xyz: { $ref: '#/components/schemas/common_notEmptyString' } }
                            }
                          ]
                        },
                        settings: { type: 'object' }
                      }
                    }
                  }
                }
              }
            },
            c_response: {
              type: 'object',
              required: ['event'],
              allOf: [{ $ref: '#/components/schemas/c_message' }],
              properties: {
                event: { enum: ['continue', 'end'] },
                messages: {
                  type: 'array',
                  items: {
                    anyOf: [
                      { $ref: '#/components/schemas/text_message' },
                      { $ref: '#/components/schemas/pp_m' },
                      { $ref: '#/components/schemas/ttch' },
                      { $ref: '#/components/schemas/aam' },
                      { $ref: '#/components/schemas/is_writing_message' }
                    ]
                  }
                },
                raw: { type: 'object' }
              }
            },
            text_message: {
              type: 'object',
              required: ['code', 'type', 'body'],
              properties: {
                code: { enum: ['message'] },
                type: { enum: ['text'] },
                body: { type: 'string' },
                payload: { type: 'string' },
                quick_replies_orientation: { enum: ['vertical', 'horizontal'] },
                quick_replies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['content_type'],
                    properties: {
                      content_type: { enum: ['text', 'location'] },
                      title: { type: 'string' },
                      payload: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                      image_url: { type: 'string' }
                    }
                  }
                },
                ttpl: {
                  type: 'object',
                  required: ['type'],
                  properties: {
                    type: { type: 'string' },
                    elements: { type: 'array', items: { type: 'object' } },
                    buttons: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            },
            pp_m: {
              type: 'object',
              required: ['code', 'type', 'body'],
              properties: {
                code: { enum: ['message'] },
                type: { enum: ['postback'] },
                body: { $ref: '#/components/schemas/common_notEmptyString' },
                payload: { type: 'string' }
              }
            },
            ttch: {
              type: 'object',
              required: ['code', 'type', 'url', 'meta'],
              properties: {
                code: { enum: ['message'] },
                type: { enum: ['attachment'] },
                url: { $ref: '#/components/schemas/common_notEmptyString' },
                meta: {
                  type: 'object',
                  required: ['mimetype'],
                  properties: {
                    originalUrl: { $ref: '#/components/schemas/common_notEmptyString' },
                    originalUrlHash: { $ref: '#/components/schemas/common_notEmptyString' },
                    originalId: { $ref: '#/components/schemas/common_notEmptyString' },
                    originalName: { $ref: '#/components/schemas/common_notEmptyString' },
                    mimetype: { $ref: '#/components/schemas/common_notEmptyString' },
                    desc: { $ref: '#/components/schemas/common_notEmptyString' },
                    key: { $ref: '#/components/schemas/common_notEmptyString' },
                    size: { type: 'number' },
                    ref: { $ref: '#/components/schemas/common_notEmptyString' }
                  }
                }
              }
            },
            aam: {
              type: 'object',
              required: ['code', 'type', 'action_code', 'args'],
              properties: {
                code: { enum: ['message'] },
                type: { enum: ['action'] },
                action_code: { $ref: '#/components/schemas/common_notEmptyString' },
                args: { type: 'array' }
              }
            },
            is_writing_message: {
              type: 'object',
              required: ['code', 'type'],
              properties: { code: { enum: ['message'] }, type: { enum: ['iswriting'] } }
            },
            qwerty: {
              type: 'object',
              required: ['id', 'labelId'],
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: {
                id: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                labelId: { type: 'string' },
                type: { enum: ['form', 'dialog', 'c'], default: 'form' },
                memoNemos: {
                  type: 'array',
                  items: {
                    anyOf: [
                      { $ref: '#/components/schemas/qwerty_metamemoNemo' },
                      { $ref: '#/components/schemas/qwerty_stringmemoNemo' },
                      { $ref: '#/components/schemas/qwerty_selectmemoNemo' },
                      { $ref: '#/components/schemas/qwerty_numbermemoNemo' },
                      { $ref: '#/components/schemas/qwerty_ratingmemoNemo' },
                      { $ref: '#/components/schemas/qwerty_booleanmemoNemo' }
                    ]
                  }
                },
                filters: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } },
                jojo: {
                  type: 'object',
                  additionalProperties: false,
                  'x-patternProperties': { '^([a-z]{2,3})(-[A-Z]{2})?$': { $ref: '#/components/schemas/global_nonEmptyString' } }
                },
                promptIds: { type: 'object', additionalProperties: { $ref: '#/components/schemas/qwerty_promptIds' } }
              }
            },
            anp: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string' },
                parent: {
                  type: 'string'
                },
                name: { allOf: [{ $ref: '#/components/schemas/anp_multilingual' }] },
                description: { allOf: [{ $ref: '#/components/schemas/anp_multilingual' }] },
                enabled: { type: 'boolean' },
                visible: {
                  type: 'boolean',
                  default: true
                },
                family: { type: 'string' },
                extra_only: { type: 'boolean' },
                extras: {
                  type: 'array',
                  items: { type: 'string' }
                },
                llls: {
                  allOf: [{ $ref: '#/components/schemas/llls' }]
                },
                azerty: {
                  type: 'object',
                  properties: {
                    pingPongs: {
                      allOf: [{ $ref: '#/components/schemas/anp_bucket' }]
                    },
                    littleBy: {
                      allOf: [{ $ref: '#/components/schemas/anp_bucket' }]
                    }
                  },
                  additionalProperties: {
                    allOf: [{ $ref: '#/components/schemas/anp_bucket' }]
                  }
                },
                blggg: {
                  type: 'object',
                  properties: { price: { $ref: '#/components/schemas/anp_price' }, bus: { $ref: '#/components/schemas/anp_interval' } }
                },
                overage: {
                  type: 'object',
                  properties: {
                    blggg: { allOf: [{ $ref: '#/components/schemas/anp_interval' }] },
                    littleBy: { $ref: '#/components/schemas/anp_reddddOverage' },
                    pingPongs: { $ref: '#/components/schemas/anp_reddddOverage' }
                  }
                }
              },
              additionalProperties: true
            },
            anp_create: {
              type: 'object',
              required: ['id', 'name'],
              allOf: [{ $ref: '#/components/schemas/anp' }],
              properties: {
                id: { not: { $ref: '#/components/schemas/anp_id' } },
                parent: {
                  allOf: [{ $ref: '#/components/schemas/anp_id' }]
                }
              }
            },
            'super-show': {
              type: 'object',
              required: ['id'],
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: {
                id: { $ref: '#/components/schemas/global_nonEmptyString' },
                description: { $ref: '#/components/schemas/global_nonEmptyString' },
                offer: { $ref: '#/components/schemas/super-show_cccmemeOffer' }
              }
            },
            pfl: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                resources: { type: 'object', additionalProperties: { type: 'boolean' } },
                scopes: {
                  type: 'object',
                  properties: {
                    owner: { allOf: [{ $ref: '#/components/schemas/pfl_amazingPropcopes' }] },
                    admin: { allOf: [{ $ref: '#/components/schemas/pfl_amazingPropcopes' }] },
                    supervisor: { allOf: [{ $ref: '#/components/schemas/pfl_amazingPropcopes' }] },
                    donald: { allOf: [{ $ref: '#/components/schemas/pfl_amazingPropcopes' }] },
                    auditor: { allOf: [{ $ref: '#/components/schemas/pfl_amazingPropcopes' }] }
                  },
                  required: ['owner', 'admin', 'supervisor', 'donald', 'auditor']
                }
              },
              required: ['id', 'resources'],
              additionalProperties: false
            },
            string: {
              type: 'object',
              required: ['id', 'values'],
              properties: {
                id: { type: 'string', minLength: 4 },
                description: { type: 'string' },
                values: {
                  type: 'object',
                  minProperties: 1,
                  additionalProperties: false,
                  'x-patternProperties': {
                    '^([a-z]{2,3})(-[A-Z]{2})?$': {
                      type: 'object',
                      required: ['value', 'state'],
                      properties: { value: { type: 'string' }, state: { enum: ['new', 'needs-review', 'final'] } }
                    }
                  }
                }
              }
            },
            ttpl: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                _description: { type: 'string' },
                _type: { type: 'string' }
              },
              required: ['id', '_type']
            },
            terzo: {
              type: 'object',
              required: ['id', 'type'],
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: { id: { $ref: '#/components/schemas/global_nonEmptyString' }, type: { $ref: '#/components/schemas/global_nonEmptyString' } },
              oneOf: [
                { $ref: '#/components/schemas/terzo_tw_lllService' },
                { $ref: '#/components/schemas/terzo_pull' },
                { $ref: '#/components/schemas/terzo_abroad' },
                { $ref: '#/components/schemas/terzo_memeHook' },
                { $ref: '#/components/schemas/terzo_cdonald' },
                { $ref: '#/components/schemas/terzo_cFilter' }
              ]
            },
            xyz: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              properties: {
                id: { type: 'string' },
                email: { anyOf: [{ type: 'string', format: 'email' }, { type: 'null' }] },
                firstname: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                meme: {
                  type: 'object'
                },
                nickname: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                mega: { anyOf: [{ type: 'string' }, { type: 'null' }] },

                surname: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                pic_url: {
                  anyOf: [
                    { title: 'Default URI', type: 'string', format: 'uri' },
                    {
                      title: 'List of URIs',
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { enum: ['original', '48', '64', '128'], type: 'string' },
                          url: { type: 'string', format: 'uri' }
                        },
                        required: ['id', 'url']
                      }
                    }
                  ]
                },
                sex: { type: 'string', enum: ['F', 'X', 'M'] },
                tags: { items: { type: 'string' }, type: 'array' },
                lang: {
                  anyOf: [
                    { title: 'Set language', allOf: [{ $ref: '#/components/schemas/global_languageId' }] },
                    { title: 'a default', type: 'string', enum: ['a'] },
                    { type: 'null' }
                  ]
                },
                pic: { description: '', type: 'string' },
                number: { anyOf: [{ type: 'null' }, { type: 'string' }] },
                attempts: { type: 'number', readOnly: true }
              },
              required: ['id', 'role']
            },
            v_v: {
              type: 'object',
              required: ['id', 'type'],
              allOf: [{ $ref: '#/components/schemas/global_hasaId' }],
              dependencies: { pattern: ['transform'] },
              properties: {
                id: { type: 'string', minLength: 1 },
                nameId: { type: 'string', minLength: 1 },
                categoryId: { type: 'string', minLength: 1 },
                descriptionId: { type: 'string', minLength: 1 },
                builtIn: { enum: [false] },
                type: { enum: ['sel', 'js', 'ws'] },
                cache: {
                  type: ['boolean', 'integer'],

                  default: true
                },
                dataType: { enum: ['string', 'number', 'boolean', 'enum'], default: 'string' },
                trim: { type: 'boolean', default: true },
                pattern: { type: 'string', minLength: 1 },
                transform: { type: 'string', minLength: 1 },
                values: { type: 'array', items: { type: 'string', minLength: 1 } }
              },
              oneOf: [
                {
                  type: 'object',
                  required: ['type', 'selector'],
                  properties: { type: { enum: ['sel'] }, selector: { type: 'string', minLength: 1 } }
                },
                {
                  type: 'object',
                  required: ['type', 'code'],
                  properties: { type: { enum: ['js'] }, selector: { type: 'string', minLength: 1 } }
                },
                {
                  type: 'object',
                  required: ['type', 'url'],
                  properties: {
                    type: { enum: ['ws'] },
                    url: { type: 'string', minLength: 1 }
                  }
                }
              ]
            },
            toyw: {
              type: 'object',
              required: ['id', 'type', 'htmlId', 'scssId'],
              allOf: [{ $ref: '#/components/schemas/global_supportsDraft' }],
              properties: {
                id: { $ref: '#/components/schemas/global_nonEmptyString' },
                type: { enum: ['gag', 'pingPong'] },
                thumbnailId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                stringIds: {
                  type: 'array',

                  items: { $ref: '#/components/schemas/global_nonEmptyString' }
                },
                htmlId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                scssId: { allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                ssetttts: {
                  type: 'array',

                  items: { $ref: '#/components/schemas/toyw_ssetttt' }
                },
                v_vs: {
                  type: 'array',

                  items: { $ref: '#/components/schemas/toyw_v_v' }
                }
              }
            },
            wwww: {
              description: '',
              properties: {
                customizationMacros: {
                  description: '',
                  properties: {
                    MICKEY_SUPPORT_FAQ: { type: ['boolean', 'string'], description: '' }
                  },
                  required: [],
                  type: 'object'
                },

                enabledTelephonyModes: { description: '', items: { description: '', enum: ['tw_lll', 'Test'], type: 'string' }, type: 'array' },
                hyhy: { description: '', type: 'boolean' },
                id: { description: '', type: 'string' },
                dev: { description: '', type: 'boolean' },
                megaHash: { description: '', enum: ['md5'], type: 'string' },
                showServiceId: { description: '', type: 'boolean' },
                okiokiServer: { description: '', enum: ['strawberries', 'strawberries-dev', 'okioki3', 'okioki2'], type: 'string' },
                secureConsole: { description: '', type: 'boolean' },
                llls: { description: '', properties: { nrt: { description: '', type: 'boolean' } }, required: ['nrt'], type: 'object' },
                logoutUrl: { description: '', type: 'string' },
                custom: {
                  description: '',
                  properties: {
                    support: { description: '', type: 'string' },
                    logo: { description: '', type: 'string' },
                    logoCompact: { description: '', type: 'string' },
                    MICKEYing_href: { description: '', type: 'string' },
                    __mememiaos: { description: '', type: 'boolean' },
                    favicon: { description: '', type: 'string' },
                    logo_w: { description: '', type: 'string' },
                    mememiaos: { description: '', type: 'boolean' }
                  },
                  required: ['support', 'logo', 'logoCompact', 'MICKEYing_href'],
                  type: 'object'
                },
                usewwwwSubdomain: { description: '', type: 'boolean' },
                nocache: { description: '', type: 'boolean' },

                jojo: { description: '', type: 'boolean' },
                reports: { description: '', type: 'boolean' },
                serviceColor: { description: '', type: 'boolean' },
                tutorials: { description: '', type: 'boolean' },
                tw_lll: { description: '', type: 'boolean' }
              },
              required: ['id'],
              type: 'object'
            },
            llls: {
              type: 'object'
            },
            country: { type: 'string', enum: [] },
            language: {
              type: 'string',
              enum: ['en', 'es', 'fr', 'it', 'ja', 'zh']
            },
            timezone: {
              type: 'string',
              enum: ['Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Algiers', 'Africa/Asmara']
            },
            anp_id: {
              type: 'string',
              enum: ['enterprise', 'trial']
            },
            pfl_id: { type: 'string', enum: [], default: 'default' },
            wwww_id: { type: 'string', enum: ['local'] },
            global_hasMetadata: {
              type: 'object',
              required: ['_metadata'],
              properties: { _metadata: { type: 'object' } }
            },
            global_hasaId: {
              type: 'object',
              required: ['id_a_c'],
              properties: { id_a_c: { type: 'string', readOnly: true } }
            },
            global_hasVersion: {
              type: 'object',
              required: ['version'],
              properties: { version: { type: 'integer', minimum: 1 } }
            },
            global_supportsDraft: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/global_hasVersion' }],
              properties: { draft: { type: 'boolean', default: false } }
            },
            global_canBeDisabled: {
              type: 'object',
              properties: { enabled: { type: 'boolean', default: true } }
            },
            global_objectId: { type: 'string', minLength: 24, maxLength: 24, pattern: '^[0-9a-fA-F]{24}$' },
            global_nonEmptyString: { type: 'string', minLength: 1 },
            global_arrayOfStrings: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } },
            global_keyMatch: {
              type: 'object',
              required: ['key', 'map'],
              properties: {
                key: { description: '', allOf: [{ $ref: '#/components/schemas/global_nonEmptyString' }] },
                map: {
                  type: 'object',
                  minProperties: 1,
                  description: '',
                  additionalProperties: {
                    anyOf: [
                      { $ref: '#/components/schemas/global_nonEmptyString' },
                      { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } }
                    ]
                  }
                }
              }
            },
            global_languageId: {
              type: 'string',
              pattern: '^([a-z]{2,3})(-[A-Z]{2})?$'
            },
            global_timestamp: { type: 'string', format: 'date-time' },
            global_validity: {
              type: 'object',
              properties: {
                from: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] },
                to: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] }
              }
            },
            global_positiveInteger: { title: 'positive number', type: 'integer', minimum: 0 },
            global_infinite: { title: 'infinite number', type: 'integer', minimum: -1, maximum: -1 },
            global_infiniteOrPositiveNumber: {
              oneOf: [{ $ref: '#/components/schemas/global_infinite' }, { $ref: '#/components/schemas/global_positiveInteger' }]
            },
            common_notEmptyString: { type: 'string', minLength: 1 },
            common_languageCode: {
              type: 'string',
              pattern: '^([a-z]{2,3})(-[A-Z]{2})?$'
            },
            a_total: {
              type: 'object',
              properties: {
                total: { allOf: [{ $ref: '#/components/schemas/global_infiniteOrPositiveNumber' }] },
                max: {
                  allOf: [{ $ref: '#/components/schemas/global_infiniteOrPositiveNumber' }]
                },
                min: {
                  allOf: [{ $ref: '#/components/schemas/global_infiniteOrPositiveNumber' }]
                },
                initial: {
                  allOf: [{ $ref: '#/components/schemas/global_positiveInteger' }]
                },
                spent: {
                  allOf: [{ $ref: '#/components/schemas/global_positiveInteger' }]
                }
              }
            },
            a_bus: {
              type: 'object',
              required: ['parent'],
              properties: {
                parent: { allOf: [{ $ref: '#/components/schemas/anp_id' }] },
                validity: { allOf: [{ $ref: '#/components/schemas/global_validity' }] },
                llls: {
                  allOf: [{ $ref: '#/components/schemas/llls' }]
                },
                azerty: { $ref: '#/components/schemas/anp/properties/azerty' },
                blggg: {
                  type: 'object',
                  properties: {
                    price: { $ref: '#/components/schemas/anp_price' },
                    bus: {
                      allOf: [{ $ref: '#/components/schemas/anp_interval' }],
                      type: 'object',
                      properties: {
                        start: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] },
                        due: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] },
                        overage_due: { allOf: [{ $ref: '#/components/schemas/global_timestamp' }] }
                      }
                    }
                  }
                },
                overage: { $ref: '#/components/schemas/anp/properties/overage' }
              }
            },
            d_majorTom: { enum: ['disabled', 'donald', 'visitor', 'ch'] },
            d_memeSettings: {
              type: 'object',

              required: ['icecream', 'fruit', 'songs'],
              properties: {
                icecream: { $ref: '#/components/schemas/d_majorTom' },
                fruit: { $ref: '#/components/schemas/d_majorTom' },
                songs: { $ref: '#/components/schemas/d_majorTom' }
              },
              additionalProperties: false
            },
            d_tags: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } },
            d_rrtnSettings: {
              type: 'object',

              properties: {
                color: { $ref: '#/components/schemas/global_nonEmptyString' },
                tags: { $ref: '#/components/schemas/d_tags' },
                optionalTags: { $ref: '#/components/schemas/d_tags' },
                assignmentTags: { $ref: '#/components/schemas/d_tags' },
                priority: { type: 'integer' },
                showPendingOnPause: { type: 'boolean' },
                forcePause: { type: 'boolean' },
                videogamePriority: { type: 'integer' },
                videogameOnBusydonalds: { type: 'boolean' },
                videogameBackTodonald: { type: 'boolean' },
                ghts: { load: { type: 'number' }, idle: { type: 'number' }, tags: { type: 'number' } },
                steps: { type: 'integer' },
                ninoTimeout: { type: 'integer' }
              }
            },
            d_valueInterval: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, additionalProperties: false },
            d_timeInterval: {
              type: 'object',

              properties: {
                minutes: { $ref: '#/components/schemas/d_valueInterval' },
                hours: { $ref: '#/components/schemas/d_valueInterval' },
                dayOfMonth: { $ref: '#/components/schemas/d_valueInterval' },
                dayOfWeek: { $ref: '#/components/schemas/d_valueInterval' },
                month: { $ref: '#/components/schemas/d_valueInterval' },
                year: { $ref: '#/components/schemas/d_valueInterval' }
              },
              additionalProperties: false
            },
            d_openingHours: {
              type: 'object',

              properties: {
                intervals: { type: 'array', items: { $ref: '#/components/schemas/d_timeInterval' } },
                exceptions: { type: 'array', items: { $ref: '#/components/schemas/d_timeInterval' } }
              },
              additionalProperties: false
            },
            d_pingPongMode: {
              type: 'object',
              required: ['offer'],
              properties: {
                offer: { $ref: '#/components/schemas/global_nonEmptyString' },
                todoListId: { $ref: '#/components/schemas/global_nonEmptyString' },
                autoStart: { type: 'boolean' },
                rrtn: { $ref: '#/components/schemas/d_rrtnSettings' },
                openingHours: { $ref: '#/components/schemas/d_openingHours' }
              }
            },
            d_pingPongAlternatives: {
              anyOf: [
                { $ref: '#/components/schemas/global_nonEmptyString' },
                { $ref: '#/components/schemas/d_pingPongMode' },
                { type: 'array', items: { $ref: '#/components/schemas/d_pingPongAlternatives' } },
                {
                  type: 'object',
                  required: ['or'],
                  additionalProperties: false,
                  properties: { or: { type: 'array', items: { $ref: '#/components/schemas/d_pingPongAlternatives' } } }
                }
              ]
            },
            d_pingPongModes: {
              type: 'object',
              properties: {
                gag: { $ref: '#/components/schemas/d_pingPongAlternatives' },
                nodonalds: { $ref: '#/components/schemas/d_pingPongAlternatives' },
                timeout: { $ref: '#/components/schemas/d_pingPongAlternatives' },
                error: { $ref: '#/components/schemas/d_pingPongAlternatives' },
                closed: { $ref: '#/components/schemas/d_pingPongAlternatives' }
              }
            },
            d_commonSettings: {
              type: 'object',
              properties: {
                meme: { $ref: '#/components/schemas/d_memeSettings' },
                rrtn: { $ref: '#/components/schemas/d_rrtnSettings' },
                openingHours: { $ref: '#/components/schemas/d_openingHours' },
                pingPongModes: { $ref: '#/components/schemas/d_pingPongModes' },
                schoolAddress: { $ref: '#/components/schemas/global_nonEmptyString' }
              }
            },
            d_todoListSettings: {
              type: 'object',
              properties: {
                todoListIds: { $ref: '#/components/schemas/global_arrayOfStrings' },
                surveyId: { $ref: '#/components/schemas/global_nonEmptyString' }
              }
            },
            d_languageSettings: {
              type: 'object',
              required: ['defaultLanguage'],
              properties: { type: { enum: ['const', 'detect'], default: 'const' }, defaultLanguage: { $ref: '#/components/schemas/global_languageId' } }
            },
            d_lemonDetectionGuest: {
              type: 'object',
              required: ['type'],
              properties: {
                mapping: {
                  type: 'object',

                  additionalProperties: { $ref: '#/components/schemas/global_languageId' }
                }
              },
              oneOf: [
                { type: 'object', properties: { type: { enum: ['page', 'domain', 'ua', 'url', 'geoip'] } } },
                { type: 'object', required: ['code'], properties: { type: { enum: ['js'] }, code: { $ref: '#/components/schemas/global_nonEmptyString' } } }
              ]
            },
            d_lemonSettings: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/d_languageSettings' }],
              properties: { strategies: { type: 'array', items: { $ref: '#/components/schemas/d_lemonDetectionGuest' } } }
            },
            d_webAction: {
              type: 'object',
              properties: { once: { type: 'boolean', default: false }, blocking: { type: 'boolean', default: false } },
              oneOf: [
                { type: 'object', required: ['code'], properties: { code: { $ref: '#/components/schemas/global_nonEmptyString' } } },
                { type: 'object', required: ['url'], properties: { url: { $ref: '#/components/schemas/global_nonEmptyString' } } }
              ]
            },
            d_miao: {
              type: 'object',
              required: ['op'],
              oneOf: [
                {
                  type: 'object',

                  required: ['miaos'],
                  properties: { op: { enum: ['and', 'or'] }, miaos: { type: 'array', item: { $ref: '#/components/schemas/d_miao' } } }
                },
                {
                  type: 'object',

                  required: ['code'],
                  properties: { op: { enum: ['js'] }, code: { $ref: '#/components/schemas/global_nonEmptyString' } }
                },
                {
                  type: 'object',

                  required: ['leftId'],
                  properties: { leftId: { $ref: '#/components/schemas/global_nonEmptyString' } },
                  allOf: [
                    {
                      oneOf: [
                        { type: 'object', require: ['rightId'], properties: { rightId: { $ref: '#/components/schemas/global_nonEmptyString' } } },
                        { type: 'object', require: ['right'] }
                      ]
                    },
                    {
                      oneOf: [
                        {
                          type: 'object',

                          properties: {
                            op: { enum: ['eq', 'ne', 'starts', 'ends', 'contains', 'matches'] },
                            right: { $ref: '#/components/schemas/global_nonEmptyString' }
                          }
                        },
                        {
                          type: 'object',

                          properties: { op: { enum: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] }, right: { type: 'number' } }
                        },
                        { type: 'object', properties: { op: { enum: ['eq', 'ne'] }, right: { type: 'boolean' } } },
                        {
                          type: 'object',

                          properties: { op: { enum: ['eq', 'ne'] }, right: { $ref: '#/components/schemas/global_nonEmptyString' } }
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            d_toywSettings: {
              type: 'object',
              required: ['ttplId'],
              properties: {
                ttplId: { $ref: '#/components/schemas/global_nonEmptyString' },
                ttplHash: { $ref: '#/components/schemas/global_nonEmptyString' },
                v_vs: { type: 'object', additionalProperties: { type: ['string', 'boolean'] } },
                strings: { type: 'array', items: { $ref: '#/components/schemas/string' } },
                customCss: { $ref: '#/components/schemas/global_nonEmptyString' },
                selector: { $ref: '#/components/schemas/global_nonEmptyString' }
              }
            },
            d_gagtoywSettings: { $ref: '#/components/schemas/d_toywSettings' },
            d_gagWebActions: {
              type: 'object',
              properties: {
                'gag-init': { $ref: '#/components/schemas/d_webAction' }
              }
            },
            d_chhWebActions: {
              oneOf: [
                { $ref: '#/components/schemas/d_gagWebActions' },
                { type: 'object', properties: { 'page-load': { $ref: '#/components/schemas/d_webAction' } } }
              ]
            },
            d_stringMatchingmiaos: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'pattern'],
                properties: {
                  type: { enum: ['equals', 'starts', 'ends', 'contains', 'matches'] },
                  pattern: { $ref: '#/components/schemas/global_nonEmptyString' }
                }
              }
            },
            d_epp: {
              type: 'object',
              required: ['id', 'name'],
              allOf: [
                { $ref: '#/components/schemas/global_canBeDisabled' },
                { $ref: '#/components/schemas/d_commonSettings' },
                { $ref: '#/components/schemas/d_todoListSettings' }
              ],
              properties: {
                id: { $ref: '#/components/schemas/global_nonEmptyString' },
                name: { $ref: '#/components/schemas/global_nonEmptyString' },
                language: { $ref: '#/components/schemas/d_languageSettings' },
                settings: { type: 'object' },
                settingsToken: { type: 'string' }
              }
            },
            d_webepp: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/d_epp' }],
              properties: {
                language: { $ref: '#/components/schemas/d_lemonSettings' },
                includedUrls: { $ref: '#/components/schemas/d_stringMatchingmiaos' },
                excludedUrls: { $ref: '#/components/schemas/d_stringMatchingmiaos' }
              }
            },
            d_gag: {
              type: 'object',
              required: ['name', 'eppIds'],
              allOf: [
                { $ref: '#/components/schemas/global_canBeDisabled' },
                { $ref: '#/components/schemas/d_commonSettings' },
                { $ref: '#/components/schemas/d_todoListSettings' }
              ],
              properties: { name: { $ref: '#/components/schemas/global_nonEmptyString' }, eppIds: { $ref: '#/components/schemas/global_arrayOfStrings' } }
            },
            d_webgag: {
              type: 'object',
              required: ['toyw'],
              allOf: [{ $ref: '#/components/schemas/d_gag' }],
              properties: {
                actions: { $ref: '#/components/schemas/d_gagWebActions' },
                miaos: { $ref: '#/components/schemas/d_miao' },
                toyw: { $ref: '#/components/schemas/d_toywSettings' }
              }
            },
            d_chh: {
              type: 'object',
              required: ['epps'],
              allOf: [
                { $ref: '#/components/schemas/global_canBeDisabled' },
                { $ref: '#/components/schemas/d_commonSettings' },
                { $ref: '#/components/schemas/d_todoListSettings' }
              ],
              properties: { epps: { type: 'array', items: { $ref: '#/components/schemas/d_epp' } } }
            },
            d_webchh: {
              type: 'object',
              required: ['gags', 'pingPong'],
              allOf: [{ $ref: '#/components/schemas/d_chh' }],
              properties: {
                epps: { type: 'array', items: { $ref: '#/components/schemas/d_webepp' } },
                gags: { type: 'array', items: { $ref: '#/components/schemas/d_webgag' } },
                chhWebActions: { $ref: '#/components/schemas/d_chhWebActions' },
                pingPong: { $ref: '#/components/schemas/d_toywSettings' }
              }
            },
            d_jimmy: {
              type: 'object',
              additionalProperties: false,
              properties: {
                abroad: { $ref: '#/components/schemas/global_nonEmptyString' },
                memeHook: { $ref: '#/components/schemas/global_nonEmptyString' },
                ctiEvents: { $ref: '#/components/schemas/global_arrayOfStrings' }
              }
            },
            ccc_todoList: {},
            ccc_cccchh: {},
            qwerty_abstractmemoNemo: {
              type: 'object',
              required: ['type'],
              properties: {
                id: { $ref: '#/components/schemas/global_nonEmptyString' },
                type: { $ref: '#/components/schemas/global_nonEmptyString' },
                labelId: { $ref: '#/components/schemas/global_nonEmptyString' },
                format: { $ref: '#/components/schemas/global_nonEmptyString' }
              }
            },
            qwerty_metamemoNemo: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/qwerty_abstractmemoNemo' }],
              oneOf: [
                { type: 'object', properties: { format: { enum: ['break'] } } },
                {
                  type: 'object',
                  required: ['id'],
                  properties: { format: { enum: ['message'] }, message: { $ref: '#/components/schemas/global_nonEmptyString' } }
                },
                { type: 'object', required: ['id', 'labelId'], properties: { format: { enum: ['section'] }, implicit: { type: 'boolean' } } }
              ],
              properties: { type: { enum: ['meta'] } }
            },
            qwerty_promptIds: {
              type: 'array',

              items: { $ref: '#/components/schemas/global_nonEmptyString' }
            },
            qwerty_dfdf: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/qwerty_abstractmemoNemo' }],
              properties: {
                placeholderId: { type: 'string' },
                required: { type: 'boolean' },
                hidden: { type: 'boolean', default: false },
                editable: { type: 'boolean' },
                defaultConstant: {
                  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
                  description: 'A default value, maybe overridden by a v_v or the xyz'
                },
                defaultv_vId: {
                  type: 'string',
                  description: 'Id of the v_v to use to fill the memoNemo. If no value is retrieved, defaultConstant is used instead'
                },
                editIfDefault: {
                  type: 'boolean',

                  default: false
                },
                promptIds: { $ref: '#/components/schemas/qwerty_promptIds' }
              }
            },
            qwerty_stringmemoNemo: {
              type: 'object',
              required: ['type'],
              allOf: [{ $ref: '#/components/schemas/qwerty_dfdf' }],
              properties: {
                type: { enum: ['string'] },
                format: {
                  enum: [],
                  default: 'text'
                },
                defaultConstant: { type: 'string' },
                minLength: { type: 'integer' },
                maxLength: { type: 'integer' },
                validation: { type: 'string' }
              }
            },
            qwerty_selectmemoNemo: {
              type: 'object',
              required: ['type'],
              allOf: [{ $ref: '#/components/schemas/qwerty_dfdf' }],
              properties: {
                type: { enum: ['dropdown'] },
                options: { type: 'object', additionalProperties: { type: 'string' }, minProperties: 1 }
              }
            },
            qwerty_numbermemoNemo: {
              type: 'object',
              required: ['type'],
              allOf: [{ $ref: '#/components/schemas/qwerty_dfdf' }],
              properties: {
                type: { enum: ['number'] },
                format: { enum: ['number', 'rating'], default: 'number' },
                defaultConstant: { type: 'number' },
                min: { type: 'integer' },
                max: { type: 'integer' }
              }
            },
            qwerty_ratingmemoNemo: {
              type: 'object',
              required: ['format', 'style'],
              allOf: [{ $ref: '#/components/schemas/qwerty_numbermemoNemo' }],
              properties: { format: { enum: ['rating'] }, style: { type: 'string' } }
            },
            qwerty_booleanmemoNemo: {
              type: 'object',
              required: ['type'],
              allOf: [{ $ref: '#/components/schemas/qwerty_dfdf' }],
              properties: {
                type: { enum: ['boolean'] },
                format: { enum: ['checkbox', 'radio'], default: 'checkbox' },
                defaultConstant: { type: 'boolean' },
                trueLabel: { type: 'string' },
                falseLabel: { type: 'string' },
                validation: { type: 'boolean' }
              }
            },
            anp_multilingual: {
              oneOf: [{ type: 'string' }, { type: 'object', properties: { it: { type: 'string' }, en: { type: 'string' }, fr: { type: 'string' } } }]
            },
            anp_singlePrice: { type: 'integer', minimum: 0 },
            anp_price: {
              type: 'object',
              required: ['eur', 'usd'],
              properties: { eur: { $ref: '#/components/schemas/anp_singlePrice' }, usd: { $ref: '#/components/schemas/anp_singlePrice' } },
              additionalProperties: { $ref: '#/components/schemas/anp_singlePrice' }
            },
            anp_interval: {
              type: 'object',
              properties: {
                frequency: { enum: ['day', 'month', 'year'], type: 'string' },
                period: { type: 'integer', minimum: 0 }
              }
            },
            anp_bucket: {
              type: 'object',
              allOf: [{ $ref: '#/components/schemas/anp_interval' }],
              properties: {
                total: {
                  type: 'integer',
                  minimum: -1
                },
                priority: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 100,
                  default: 50
                }
              }
            },
            anp_reddddOverage: {
              type: 'object',
              properties: {
                unit: {
                  type: 'integer',
                  minimum: 1,
                  default: 1
                },
                max: {
                  type: 'integer',
                  minimum: -1,
                  default: -1
                },
                brackets: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['price'],
                    properties: {
                      from: { type: 'integer', minimum: 0 },
                      to: { type: 'integer', minimum: 0 },
                      price: { $ref: '#/components/schemas/anp_price' }
                    }
                  }
                }
              }
            },
            'super-show_transmissionmiaos': { enum: ['required', 'optional', 'off'] },
            'super-show_transmissionVia': { enum: ['net', 'pstn'] },
            'super-show_cccmemeSpec': {
              type: 'object',
              required: ['tx', 'rx'],
              properties: {
                tx: { $ref: '#/components/schemas/super-show_transmissionmiaos' },
                rx: { $ref: '#/components/schemas/super-show_transmissionmiaos' },
                engine: { $ref: '#/components/schemas/global_nonEmptyString' },
                via: { $ref: '#/components/schemas/super-show_transmissionVia' }
              }
            },
            'super-show_cccmemeOffer': {
              type: 'object',
              properties: {
                icecream: { $ref: '#/components/schemas/super-show_cccmemeSpec' },
                fruit: { $ref: '#/components/schemas/super-show_cccmemeSpec' },
                songs: { $ref: '#/components/schemas/super-show_cccmemeSpec' },
                Sharing: { $ref: '#/components/schemas/super-show_cccmemeSpec' }
              }
            },
            pfl_amazingPropcopes: {
              items: {
                type: 'string',
                pattern: '^-?(?:[*]|\\w+)(?:[.](?:[*]|\\w+))?$'
              },
              type: 'array'
            },
            terzo_tw_lllService: {
              type: 'object',
              required: ['auth'],
              properties: {
                type: { enum: ['tw_lll'] },
                auth: {
                  type: 'object',
                  required: ['sid', 'token'],
                  properties: { sid: { $ref: '#/components/schemas/global_nonEmptyString' }, token: { $ref: '#/components/schemas/global_nonEmptyString' } }
                }
              }
            },
            terzo_TestService: {
              type: 'object',
              properties: {
                url: { $ref: '#/components/schemas/global_nonEmptyString' },
                auth: {
                  type: 'object',
                  required: ['type', 'amazingWow'],
                  properties: { amazingWow: { $ref: '#/components/schemas/global_nonEmptyString' } },
                  oneOf: [
                    {
                      type: 'object',
                      required: ['xyz'],
                      properties: { type: { enum: ['basic'] }, xyz: { $ref: '#/components/schemas/global_nonEmptyString' } }
                    },
                    { type: 'object', properties: { type: { enum: ['bearer'] } }, not: { type: 'object', required: ['xyz'] } }
                  ]
                }
              }
            },
            terzo_pull: {
              type: 'object',
              required: ['url', 'events'],
              allOf: [{ $ref: '#/components/schemas/terzo_TestService' }],
              properties: {
                type: { enum: ['pull'] },
                events: { type: 'array', items: { enum: ['new', 'end', 'change', 'finalized', 'message'] }, minItems: 1 }
              }
            },
            terzo_abroad: {
              type: 'object',
              required: ['url'],
              allOf: [{ $ref: '#/components/schemas/terzo_TestService' }],
              properties: { type: { enum: ['extrouter'] } }
            },
            terzo_memeHook: {
              type: 'object',
              required: ['url'],
              allOf: [{ $ref: '#/components/schemas/terzo_TestService' }],
              properties: { type: { enum: ['memehook'] } }
            },
            terzo_carc: {
              type: 'object',
              required: ['settings'],
              properties: {
                engine: { enum: ['car'] },
                settings: {
                  type: 'object',
                  required: ['token'],
                  properties: {
                    token: { $ref: '#/components/schemas/global_nonEmptyString' },
                    startEvent: { $ref: '#/components/schemas/global_nonEmptyString' }
                  }
                }
              }
            },
            terzo_carV2c: {
              type: 'object',
              required: ['settings'],
              properties: {
                engine: { enum: ['carV2'] },
                settings: {
                  type: 'object',
                  required: ['projectId', 'privateKey', 'eEmail', 'eId', 'startEvent'],
                  properties: {
                    projectId: { $ref: '#/components/schemas/global_nonEmptyString' },
                    privateKey: { $ref: '#/components/schemas/global_nonEmptyString' },
                    eEmail: { $ref: '#/components/schemas/global_nonEmptyString' },
                    eId: { $ref: '#/components/schemas/global_nonEmptyString' },
                    languageCode: { $ref: '#/components/schemas/global_nonEmptyString' },
                    startEvent: { $ref: '#/components/schemas/global_nonEmptyString' }
                  }
                }
              }
            },
            terzo_airplanec: {
              type: 'object',
              required: ['settings'],
              properties: {
                engine: { enum: ['airplane'] },
                settings: {
                  type: 'object',
                  required: ['placeId', 'username', 'mega'],
                  properties: {
                    placeId: { $ref: '#/components/schemas/global_nonEmptyString' },
                    username: { $ref: '#/components/schemas/global_nonEmptyString' },
                    mega: { $ref: '#/components/schemas/global_nonEmptyString' },
                    endEventKey: { $ref: '#/components/schemas/global_nonEmptyString' },
                    version: { $ref: '#/components/schemas/global_nonEmptyString' }
                  }
                }
              }
            },
            terzo_sweetsc: {
              type: 'object',
              required: ['settings'],
              properties: {
                engine: { enum: ['sweets'] },
                settings: {
                  type: 'object',
                  required: ['directLineSiteId', 'amazingWow', 'autoConvertMessages'],
                  properties: {
                    directLineSiteId: { $ref: '#/components/schemas/global_nonEmptyString' },
                    amazingWow: { $ref: '#/components/schemas/global_nonEmptyString' },
                    startMessage: { $ref: '#/components/schemas/global_nonEmptyString' },
                    autoConvertMessages: { type: 'boolean' },
                    videogameKey: { $ref: '#/components/schemas/global_nonEmptyString' },
                    videogameValue: { $ref: '#/components/schemas/global_nonEmptyString' }
                  }
                }
              }
            },
            terzo_customc: { type: 'object', required: ['url'] },
            terzo_cdonald: {
              type: 'object',
              required: ['engine'],
              allOf: [{ $ref: '#/components/schemas/terzo_TestService' }],
              properties: {
                type: { enum: ['c.donald'] },
                engine: { $ref: '#/components/schemas/global_nonEmptyString' },
                requestFilters: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } },
                responseFilters: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } }
              },
              oneOf: [
                { $ref: '#/components/schemas/terzo_carc' },
                { $ref: '#/components/schemas/terzo_carV2c' },
                { $ref: '#/components/schemas/terzo_airplanec' },
                { $ref: '#/components/schemas/terzo_sweetsc' },
                { $ref: '#/components/schemas/terzo_customc' }
              ]
            },
            terzo_cFilter: {
              type: 'object',
              required: ['url'],
              allOf: [{ $ref: '#/components/schemas/terzo_TestService' }],
              properties: { type: { enum: ['c.filter'] }, requests: { type: 'boolean' }, responses: { type: 'boolean' } }
            },
            xyz_meme: {
              anyOf: [{ type: 'boolean' }, { type: 'number', minimum: -1 }],
              default: 0
            },
            toyw_sha256: { type: 'string', pattern: '[0-9a-fA-F]{64}' },
            toyw_v_v: {
              type: 'object',
              required: ['id', 'type', 'nameId'],
              properties: {
                id: { $ref: '#/components/schemas/global_nonEmptyString' },
                nameId: { $ref: '#/components/schemas/global_nonEmptyString' },
                categoryIds: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } },
                descriptionId: { $ref: '#/components/schemas/global_nonEmptyString' },
                priority: { type: 'integer' },
                hidden: { type: 'boolean', default: false },
                required: { type: 'boolean', default: false }
              },
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    type: { enum: ['color', 'file', 'string', 'unit', 'border-style', 'multi-unit', 'border', 'box-shadow'] },
                    defaultValue: { $ref: '#/components/schemas/global_nonEmptyString' }
                  }
                },
                { type: 'object', properties: { type: { enum: ['boolean'] }, defaultValue: { type: 'boolean' } } },
                {
                  type: 'object',
                  required: ['options'],
                  properties: {
                    type: { enum: ['enum'] },
                    defaultValue: { type: 'string' },
                    options: { type: 'array', items: { $ref: '#/components/schemas/global_nonEmptyString' } }
                  }
                }
              ]
            },
            toyw_ssetttt: {
              type: 'object',
              required: ['id', 'path'],
              properties: {
                id: { $ref: '#/components/schemas/global_nonEmptyString' },
                path: { $ref: '#/components/schemas/global_nonEmptyString' },
                hash: { $ref: '#/components/schemas/toyw_sha256' },
                type: { $ref: '#/components/schemas/global_nonEmptyString' },
                size: { type: 'integer' }
              }
            }
          },
          responses: {
            defaultError: {
              content: { 'b/json': { schema: { $ref: '#/components/schemas/errorResponse' } } }
            },
            notFound: {
              content: { 'b/json': { schema: { $ref: '#/components/schemas/errorResponse' } } }
            }
          },
          parameters: {
            id: { name: 'id', in: 'path', schema: { type: 'string' }, required: true },
            limit: {
              name: 'limit',
              in: 'query',

              schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 }
            },
            skip: {
              name: 'skip',
              in: 'query',

              schema: { type: 'integer', default: 0, minimum: 0 }
            },
            memoNemos: {
              name: 'memoNemos',
              in: 'query',

              schema: { type: 'array', items: { type: 'string' }, uniqueItems: true }
            },
            sort: {
              name: 'sort',
              in: 'query',

              schema: { type: 'array', items: { type: 'string' }, uniqueItems: true }
            },

            version: { name: 'version', in: 'path', schema: { type: 'integer' }, required: true }
          },
          itysSchemes: {
            basic: { type: 'http', scheme: 'basic' },
            eCredentials: {
              type: 'oauth2',
              flows: {
                eCredentials: {
                  scopes: {}
                }
              }
            },
            session: { type: 'apiKey', name: 'vvcsid', in: 'cookie' }
          }
        },
        paths: {
          '/as': {
            get: {
              operationId: 'a.query',
              tags: ['a'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/a' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of as',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['a.query'] }, { session: [] }]
            },
            post: {
              operationId: 'a.create',
              tags: ['a'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/a' } } } },
                default: { $ref: '#/components/responses/defaultError' }
              },
              requestBody: { content: { 'b/json': { schema: { $ref: '#/components/schemas/a' } } } },
              itys: [{ basic: [] }, { eCredentials: ['a.create'] }, { session: [] }]
            }
          },
          '/as/{id}': {
            get: {
              operationId: 'a.read',
              tags: ['a'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/a' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a a by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['a.read'] }, { session: [] }]
            },
            put: {
              operationId: 'a.update',
              tags: ['a'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/a' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a a',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/a' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['a.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'a.remove',
              tags: ['a'],
              responses: { default: { $ref: '#/components/responses/defaultError' } },
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['a.remove'] }, { session: [] }]
            }
          },
          '/bs': {
            get: {
              operationId: 'b.query',
              tags: ['b'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/b' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of bs',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['b.query'] }, { session: [] }]
            },
            post: {
              operationId: 'b.create',
              tags: ['b'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/b' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new b',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/b' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['b.create'] }, { session: [] }]
            }
          },
          '/bs/{id}': {
            get: {
              operationId: 'b.read',
              tags: ['b'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/b' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a b by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['b.read'] }, { session: [] }]
            },
            put: {
              operationId: 'b.update',
              tags: ['b'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/b' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a b',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/b' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['b.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'b.remove',
              tags: ['b'],
              responses: {
                '200': { description: 'b successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a b by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['b.remove'] }, { session: [] }]
            }
          },
          '/bs/{id}/public/script/{script}': {
            get: {
              operationId: 'b.getScript',
              tags: ['b'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['inline', 'url'] },
                          script: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a public Javascript ssetttt by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { name: 'script', in: 'path', schema: { type: 'string' }, required: true }],
              itys: [{ basic: [] }, { eCredentials: [] }, { session: [] }]
            }
          },
          '/ssetttts': {
            post: {
              operationId: 'ssetttt.upload',
              tags: ['ssetttt'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          type: { type: 'string' },
                          size: { type: 'integer' }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
              requestBody: { content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } } },
              itys: [{ basic: [] }, { eCredentials: ['ssetttt.upload'] }, { session: [] }]
            },
            get: {
              operationId: 'ssetttt.list',
              tags: ['ssetttt'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            ts: { type: 'string', format: 'date-time' },
                            size: { type: 'integer' }
                          }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [{ name: 'prefix', in: 'query', schema: { type: 'string' } }],
              itys: [{ basic: [] }, { eCredentials: ['ssetttt.list'] }, { session: [] }]
            }
          },
          '/cs': {
            get: {
              operationId: 'c.query',
              tags: ['c'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/c' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of cs',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['c.query'] }, { session: [] }]
            },
            post: {
              operationId: 'c.create',
              tags: ['c'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/c' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new c',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/c' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['c.create'] }, { session: [] }]
            }
          },
          '/cs/{id}': {
            get: {
              operationId: 'c.read',
              tags: ['c'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/c' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a c by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['c.read'] }, { session: [] }]
            },
            put: {
              operationId: 'c.update',
              tags: ['c'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/c' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a c',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/c' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['c.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'c.remove',
              tags: ['c'],
              responses: {
                '200': { description: 'c successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a c by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['c.remove'] }, { session: [] }]
            }
          },
          '/cs/{id}/enable': {
            post: {
              operationId: 'c.enable',
              tags: ['c'],
              responses: {
                '200': { description: 'Resource successfully enabled' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Enable the Resource',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['c.enable'] }, { session: [] }]
            }
          },
          '/cs/{id}/disable': {
            post: {
              operationId: 'c.disable',
              tags: ['c'],
              responses: {
                '200': { description: 'Resource successfully disabled' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Disable the Resource',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['c.disable'] }, { session: [] }]
            }
          },
          '/ds': {
            get: {
              operationId: 'd.query',
              tags: ['d'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/d' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of ds',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['d.query'] }, { session: [] }]
            },
            post: {
              operationId: 'd.create',
              tags: ['d'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new d',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['d.create'] }, { session: [] }]
            }
          },
          '/ds/{id}': {
            get: {
              operationId: 'd.read',
              tags: ['d'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a d by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['d.read'] }, { session: [] }]
            },
            put: {
              operationId: 'd.update',
              tags: ['d'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a d',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['d.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'd.remove',
              tags: ['d'],
              responses: {
                '200': { description: 'd successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a d by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['d.remove'] }, { session: [] }]
            }
          },
          '/ds/{id}/all': {
            get: {
              operationId: 'd.queryAll',
              tags: ['d'],
              responses: { default: { $ref: '#/components/responses/defaultError' } },
              summary: 'Retrieve all versions of a d',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['d.queryAll'] }, { session: [] }]
            }
          },
          '/ds/{id}/{version}': {
            get: {
              operationId: 'd.readVersion',
              tags: ['d'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a specific version of  d',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }, { $ref: '#/components/parameters/version' }],
              itys: [{ basic: [] }, { eCredentials: ['d.readVersion'] }, { session: [] }]
            }
          },
          '/ds/{id}/activate': {
            post: {
              operationId: 'd.activate',
              tags: ['d'],
              responses: {
                '200': { description: 'Resource successfully activated' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Activate the Resource',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['d.activate'] }, { session: [] }]
            }
          },
          '/ds/{id}/discard': {
            post: {
              operationId: 'd.discard',
              tags: ['d'],
              responses: {
                '200': { description: 'Draft successfully discarded' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Discard the draft',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['d.discard'] }, { session: [] }]
            }
          },
          '/ds/{id}/enable': {
            post: {
              operationId: 'd.enable',
              tags: ['d'],
              responses: {
                '200': { description: 'Resource successfully enabled' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Enable the Resource',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['d.enable'] }, { session: [] }]
            }
          },
          '/ds/{id}/disable': {
            post: {
              operationId: 'd.disable',
              tags: ['d'],
              responses: {
                '200': { description: 'Resource successfully disabled' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Disable the Resource',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['d.disable'] }, { session: [] }]
            }
          },
          '/ds/{id}/upload': {
            post: {
              operationId: 'd.upload',
              tags: ['d'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          type: { type: 'string' },
                          size: { type: 'integer' }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [{ $ref: '#/components/parameters/id' }, { name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
              requestBody: { content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } } },
              itys: [{ basic: [] }, { eCredentials: ['d.upload'] }, { session: [] }]
            }
          },
          '/es': {
            get: {
              operationId: 'nutella.query',
              tags: ['nutella'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/e' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of nutellas',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['nutella.query'] }, { session: [] }]
            },
            post: {
              operationId: 'nutella.create',
              tags: ['nutella'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/e' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new nutella',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/e' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['nutella.create'] }, { session: [] }]
            }
          },
          '/es/{id}': {
            get: {
              operationId: 'nutella.read',
              tags: ['nutella'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/e' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a nutella by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['nutella.read'] }, { session: [] }]
            },
            put: {
              operationId: 'nutella.update',
              tags: ['nutella'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/e' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a nutella',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/e' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['nutella.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'nutella.remove',
              tags: ['nutella'],
              responses: {
                '200': { description: 'nutella successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a nutella by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['nutella.remove'] }, { session: [] }]
            }
          },
          '/cccs/{id}': {
            get: {
              operationId: 'Test.read',
              tags: ['Test'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/ccc' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a Test by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['Test.read'] }, { session: [] }]
            },
            delete: {
              operationId: 'Test.remove',
              tags: ['Test'],
              responses: {
                '200': { description: 'Test successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a Test by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['Test.remove'] }, { session: [] }]
            }
          },
          '/cccs/{id}/c-response': {
            post: {
              operationId: 'Test.cResponse',
              tags: ['Test'],
              responses: {
                '200': { description: 'Message successfully processed' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a public Javascript ssetttt by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: { content: { 'b/json': { schema: { $ref: '#/components/schemas/c_response' } } } },
              itys: [{ basic: [] }, { eCredentials: ['Test.cResponse'] }, { session: [] }]
            }
          },
          '/cccs/{id}/attach': {
            post: {
              operationId: 'Test.attach',
              tags: ['Test'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                          meta: { $ref: '#/components/schemas/ttch/properties/meta' }
                        }
                      }
                    }
                  }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [
                { $ref: '#/components/parameters/id' },
                { name: 'ref', in: 'query', schema: { type: 'string' } },
                { name: 'desc', in: 'query', schema: { type: 'string' } }
              ],
              requestBody: { content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } } },
              itys: [{ basic: [] }, { eCredentials: ['Test.attach'] }, { session: [] }]
            }
          },
          '/cccs/{id}/c-attach': {
            post: {
              operationId: 'Test.cAttach',
              tags: ['Test'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          url: { type: 'string' },
                          meta: { $ref: '#/components/schemas/ttch/properties/meta' }
                        }
                      }
                    }
                  }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [
                { $ref: '#/components/parameters/id' },
                { name: 'ref', in: 'query', schema: { type: 'string' } },
                { name: 'desc', in: 'query', schema: { type: 'string' } }
              ],
              requestBody: { content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } } },
              itys: [{ basic: [] }, { eCredentials: ['Test.cAttach'] }, { session: [] }]
            }
          },
          '/be-braves': {
            get: {
              operationId: 'todoList.query',
              tags: ['todoList'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/qwerty' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of todoLists',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['todoList.query'] }, { session: [] }]
            },
            post: {
              operationId: 'todoList.create',
              tags: ['todoList'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/qwerty' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new todoList',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/qwerty' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['todoList.create'] }, { session: [] }]
            }
          },
          '/be-braves/{id}': {
            get: {
              operationId: 'todoList.read',
              tags: ['todoList'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/qwerty' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a todoList by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['todoList.read'] }, { session: [] }]
            },
            put: {
              operationId: 'todoList.update',
              tags: ['todoList'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/qwerty' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a todoList',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/qwerty' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['todoList.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'todoList.remove',
              tags: ['todoList'],
              responses: {
                '200': { description: 'todoList successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a todoList by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['todoList.remove'] }, { session: [] }]
            }
          },
          '/anps': {
            get: {
              operationId: 'anp.query',
              tags: ['anp'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/anp' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of anps',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['anp.query'] }, { session: [] }]
            },
            post: {
              operationId: 'anp.create',
              tags: ['anp'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/anp' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new anp',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/anp_create' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['anp.create'] }, { session: [] }]
            }
          },
          '/anps/{id}': {
            get: {
              operationId: 'anp.read',
              tags: ['anp'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/anp' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a anp by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['anp.read'] }, { session: [] }]
            },
            put: {
              operationId: 'anp.update',
              tags: ['anp'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/anp' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a anp',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/anp_create' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['anp.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'anp.remove',
              tags: ['anp'],
              responses: {
                '200': { description: 'anp successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a anp by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['anp.remove'] }, { session: [] }]
            }
          },
          '/super-shows': {
            get: {
              operationId: 'super-show.query',
              tags: ['super-show'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/super-show' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of super-shows',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['super-show.query'] }, { session: [] }]
            },
            post: {
              operationId: 'super-show.create',
              tags: ['super-show'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/super-show' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new super-show',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/super-show' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['super-show.create'] }, { session: [] }]
            }
          },
          '/super-shows/{id}': {
            get: {
              operationId: 'super-show.read',
              tags: ['super-show'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/super-show' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a super-show by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['super-show.read'] }, { session: [] }]
            },
            put: {
              operationId: 'super-show.update',
              tags: ['super-show'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/super-show' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a super-show',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/super-show' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['super-show.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'super-show.remove',
              tags: ['super-show'],
              responses: {
                '200': { description: 'super-show successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a super-show by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['super-show.remove'] }, { session: [] }]
            }
          },
          '/pfls': {
            get: {
              operationId: 'pfl.query',
              tags: ['pfl'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/pfl' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of pfls',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['pfl.query'] }, { session: [] }]
            },
            post: {
              operationId: 'pfl.create',
              tags: ['pfl'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/pfl' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new pfl',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/pfl' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['pfl.create'] }, { session: [] }]
            }
          },
          '/pfls/{id}': {
            get: {
              operationId: 'pfl.read',
              tags: ['pfl'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/pfl' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a pfl by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['pfl.read'] }, { session: [] }]
            },
            put: {
              operationId: 'pfl.update',
              tags: ['pfl'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/pfl' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a pfl',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/pfl' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['pfl.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'pfl.remove',
              tags: ['pfl'],
              responses: {
                '200': { description: 'pfl successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a pfl by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['pfl.remove'] }, { session: [] }]
            }
          },
          '/mirror/me': {
            get: {
              operationId: 'mirror.me',
              tags: ['mirror'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          xyz: { $ref: '#/components/schemas/xyz' },
                          acct: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              lang: { $ref: '#/components/schemas/global_languageId' },
                              tw_lll: { type: 'object', properties: { sid: { type: 'string' }, token: { type: 'string' } } }
                            }
                          },
                          limits: { $ref: '#/components/schemas/llls' }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              itys: [{ basic: [] }, { eCredentials: ['mirror.me'] }, { session: [] }]
            }
          },
          '/mirror/cli': {
            get: {
              operationId: 'mirror.cli',
              tags: ['mirror'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          minVersion: { type: 'string' },
                          scopes: { type: 'string' },
                          ssetttts: { type: 'string' }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              itys: [{ basic: [] }, { eCredentials: ['mirror.cli'] }, { session: [] }]
            }
          },
          '/strings': {
            get: {
              operationId: 'String.query',
              tags: ['String'],
              responses: { default: { $ref: '#/components/responses/defaultError' } },
              parameters: [{ name: 'path', in: 'query', schema: { type: 'array', items: { type: 'string', minItems: 1 } } }],
              itys: [{ basic: [] }, { eCredentials: ['String.query'] }, { session: [] }]
            },
            post: {
              operationId: 'String.create',
              tags: ['String'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/string' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new String',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/string' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['String.create'] }, { session: [] }]
            }
          },
          '/strings/{id}': {
            get: {
              operationId: 'String.read',
              tags: ['String'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/string' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a String by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['String.read'] }, { session: [] }]
            },
            put: {
              operationId: 'String.update',
              tags: ['String'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/string' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a String',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/string' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['String.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'String.remove',
              tags: ['String'],
              responses: {
                '200': { description: 'String successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a String by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['String.remove'] }, { session: [] }]
            }
          },
          '/ttpls': {
            get: {
              operationId: 'ttpl.query',
              tags: ['ttpl'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ttpl' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of ttpls',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['ttpl.query'] }, { session: [] }]
            },
            post: {
              operationId: 'ttpl.create',
              tags: ['ttpl'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/ttpl' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new ttpl',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/ttpl' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['ttpl.create'] }, { session: [] }]
            }
          },
          '/ttpls/{id}': {
            get: {
              operationId: 'ttpl.read',
              tags: ['ttpl'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/ttpl' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a ttpl by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['ttpl.read'] }, { session: [] }]
            },
            put: {
              operationId: 'ttpl.update',
              tags: ['ttpl'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/ttpl' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a ttpl',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/ttpl' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['ttpl.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'ttpl.remove',
              tags: ['ttpl'],
              responses: {
                '200': { description: 'ttpl successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a ttpl by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['ttpl.remove'] }, { session: [] }]
            }
          },
          '/my-friends': {
            get: {
              operationId: 'myFriends.query',
              tags: ['myFriends'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/terzo' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of myFriendss',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['myFriends.query'] }, { session: [] }]
            },
            post: {
              operationId: 'myFriends.create',
              tags: ['myFriends'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/terzo' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new myFriends',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/terzo' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['myFriends.create'] }, { session: [] }]
            }
          },
          '/my-friends/{id}': {
            get: {
              operationId: 'myFriends.read',
              tags: ['myFriends'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/terzo' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a myFriends by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['myFriends.read'] }, { session: [] }]
            },
            put: {
              operationId: 'myFriends.update',
              tags: ['myFriends'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/terzo' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a myFriends',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/terzo' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['myFriends.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'myFriends.remove',
              tags: ['myFriends'],
              responses: {
                '200': { description: 'myFriends successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a myFriends by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['myFriends.remove'] }, { session: [] }]
            }
          },
          '/amazingProp': {
            get: {
              operationId: 'xyz.query',
              tags: ['xyz'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/xyz' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of amazingProp',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['xyz.query'] }, { session: [] }]
            },
            post: {
              operationId: 'xyz.create',
              tags: ['xyz'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/xyz' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new xyz',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/xyz' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['xyz.create'] }, { session: [] }]
            }
          },
          '/amazingProp/{id}': {
            get: {
              operationId: 'xyz.read',
              tags: ['xyz'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/xyz' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a xyz by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['xyz.read'] }, { session: [] }]
            },
            put: {
              operationId: 'xyz.update',
              tags: ['xyz'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/xyz' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a xyz',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/xyz' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['xyz.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'xyz.remove',
              tags: ['xyz'],
              responses: {
                '200': { description: 'xyz successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a xyz by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['xyz.remove'] }, { session: [] }]
            }
          },
          '/v_vs': {
            get: {
              operationId: 'v_v.query',
              tags: ['v_v'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/v_v' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of v_vs',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['v_v.query'] }, { session: [] }]
            },
            post: {
              operationId: 'v_v.create',
              tags: ['v_v'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/v_v' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new v_v',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/v_v' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['v_v.create'] }, { session: [] }]
            }
          },
          '/v_vs/{id}': {
            get: {
              operationId: 'v_v.read',
              tags: ['v_v'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/v_v' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a v_v by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['v_v.read'] }, { session: [] }]
            },
            put: {
              operationId: 'v_v.update',
              tags: ['v_v'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/v_v' } } }
                },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a v_v',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/v_v' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['v_v.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'v_v.remove',
              tags: ['v_v'],
              responses: {
                '200': { description: 'v_v successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a v_v by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['v_v.remove'] }, { session: [] }]
            }
          },
          '/toyws': {
            get: {
              operationId: 'toyw.query',
              tags: ['toyw'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/toyw' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of toyws',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['toyw.query'] }, { session: [] }]
            },
            post: {
              operationId: 'toyw.create',
              tags: ['toyw'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/toyw' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new toyw',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/toyw' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['toyw.create'] }, { session: [] }]
            }
          },
          '/toyws/{id}': {
            get: {
              operationId: 'toyw.read',
              tags: ['toyw'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/toyw' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a toyw by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['toyw.read'] }, { session: [] }]
            },
            put: {
              operationId: 'toyw.update',
              tags: ['toyw'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/toyw' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a toyw',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/toyw' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['toyw.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'toyw.remove',
              tags: ['toyw'],
              responses: {
                '200': { description: 'toyw successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a toyw by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['toyw.remove'] }, { session: [] }]
            }
          },
          '/toyws/{id}/all': {
            get: {
              operationId: 'toyw.queryAll',
              tags: ['toyw'],
              responses: { default: { $ref: '#/components/responses/defaultError' } },
              summary: 'Retrieve all versions of a toyw',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['toyw.queryAll'] }, { session: [] }]
            }
          },
          '/toyws/{id}/{version}': {
            get: {
              operationId: 'toyw.readVersion',
              tags: ['toyw'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/toyw' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a specific version of  toyw',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }, { $ref: '#/components/parameters/version' }],
              itys: [{ basic: [] }, { eCredentials: ['toyw.readVersion'] }, { session: [] }]
            }
          },
          '/toyws/{id}/activate': {
            post: {
              operationId: 'toyw.activate',
              tags: ['toyw'],
              responses: {
                '200': { description: 'Resource successfully activated' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Activate the Resource',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['toyw.activate'] }, { session: [] }]
            }
          },
          '/toyws/{id}/discard': {
            post: {
              operationId: 'toyw.discard',
              tags: ['toyw'],
              responses: {
                '200': { description: 'Draft successfully discarded' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Discard the draft',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['toyw.discard'] }, { session: [] }]
            }
          },
          '/toyws/{id}/upload': {
            post: {
              operationId: 'toyw.upload',
              tags: ['toyw'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          type: { type: 'string' },
                          size: { type: 'integer' }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [{ $ref: '#/components/parameters/id' }, { name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
              requestBody: { content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } } },
              itys: [{ basic: [] }, { eCredentials: ['toyw.upload'] }, { session: [] }]
            }
          },
          '/toyws/{id}/upload/global': {
            post: {
              operationId: 'toyw.uploadGlobal',
              tags: ['toyw'],
              responses: {
                '200': {
                  content: {
                    'b/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          type: { type: 'string' },
                          size: { type: 'integer' }
                        }
                      }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              parameters: [{ $ref: '#/components/parameters/id' }, { name: 'id', in: 'query', required: true, schema: { type: 'string' } }],
              requestBody: { content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } } },
              itys: [{ basic: [] }, { eCredentials: ['toyw.uploadGlobal'] }, { session: [] }]
            }
          },
          '/wwwws': {
            get: {
              operationId: 'wwww.query',
              tags: ['wwww'],
              responses: {
                '200': {
                  content: { 'b/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/wwww' } } } },
                  headers: {
                    Link: { schema: { type: 'string' } },
                    'Results-Matching': { schema: { type: 'integer', minimum: 0 } },
                    'Results-Skipped': {
                      schema: { type: 'integer', minimum: 0 }
                    }
                  }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a list of wwwws',
              parameters: [
                { $ref: '#/components/parameters/limit' },
                { $ref: '#/components/parameters/skip' },
                { $ref: '#/components/parameters/memoNemos' },
                { $ref: '#/components/parameters/sort' },
                { $ref: '#/components/parameters/query' }
              ],
              itys: [{ basic: [] }, { eCredentials: ['wwww.query'] }, { session: [] }]
            },
            post: {
              operationId: 'wwww.create',
              tags: ['wwww'],
              responses: {
                '201': {
                  content: { 'b/json': { schema: { $ref: '#/components/schemas/wwww' } } },
                  headers: { Location: { schema: { type: 'string', format: 'uri' } } }
                },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Create a new wwww',
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/wwww' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['wwww.create'] }, { session: [] }]
            }
          },
          '/wwwws/{id}': {
            get: {
              operationId: 'wwww.read',
              tags: ['wwww'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/wwww' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Retrieve a wwww by id',
              parameters: [{ $ref: '#/components/parameters/id' }, { $ref: '#/components/parameters/memoNemos' }],
              itys: [{ basic: [] }, { eCredentials: ['wwww.read'] }, { session: [] }]
            },
            put: {
              operationId: 'wwww.update',
              tags: ['wwww'],
              responses: {
                '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/wwww' } } } },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Update a wwww',
              parameters: [{ $ref: '#/components/parameters/id' }],
              requestBody: {
                content: { 'b/json': { schema: { $ref: '#/components/schemas/wwww' } } },
                required: true
              },
              itys: [{ basic: [] }, { eCredentials: ['wwww.update'] }, { session: [] }]
            },
            delete: {
              operationId: 'wwww.remove',
              tags: ['wwww'],
              responses: {
                '200': { description: 'wwww successfully deleted' },
                '404': { $ref: '#/components/responses/notFound' },
                default: { $ref: '#/components/responses/defaultError' }
              },
              summary: 'Delete a wwww by id',
              parameters: [{ $ref: '#/components/parameters/id' }],
              itys: [{ basic: [] }, { eCredentials: ['wwww.remove'] }, { session: [] }]
            }
          }
        },
        tags: [],
        servers: [{ url: 'https://bb.Test.com/api/' }]
      };
      rebased.should.deep.equal(expectedSpec);
    });
  });
  describe('rebaseOASDefinitions() for a spec containing multi-level nested definitions', function() {
    it('for a multi-level definitions spec, it should return the spec with moved definitions in #/components/schemas and $refs updated accordingly', function() {
      const rebased = rebaseOASDefinitions(nestedDefinitionsSpec);
      const expectedSpec = {
        openapi: '3.0.2',
        info: { title: 'nestedDefinitionsSpec', version: '7.0.0-dev1' },
        components: {
          schemas: {
            propertyA_valueInterval: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, additionalProperties: false },
            propertyA_timeInterval: {
              type: 'object',
              properties: {
                minutes: { $ref: '#/components/schemas/propertyA_valueInterval' },
                hours: { $ref: '#/components/schemas/propertyA_valueInterval' },
                dayOfMonth: { $ref: '#/components/schemas/propertyA_valueInterval' },
                dayOfWeek: { $ref: '#/components/schemas/propertyA_valueInterval' },
                month: { $ref: '#/components/schemas/propertyA_valueInterval' },
                year: { $ref: '#/components/schemas/propertyA_valueInterval' }
              },
              additionalProperties: false
            },
            propertyA_openingHours: {
              type: 'object',
              description: 'Opening hours of the propertyA',
              properties: {
                intervals: { type: 'array', items: { $ref: '#/components/schemas/propertyA_timeInterval' } },
                exceptions: { type: 'array', items: { $ref: '#/components/schemas/propertyA_timeInterval' } },
                aFoo: {
                  $ref: '#/components/schemas/propertyA_openingHours_defA'
                }
              },
              additionalProperties: false
            },
            propertyA_openingHours_defA: {
              type: 'object',
              properties: {
                a1: {
                  type: 'string'
                },
                a2: {
                  type: 'string',
                  minLength: 2
                }
              }
            },
            propertyA: {
              type: 'object',
              required: ['name', 'languages', 'defaultLanguage', 'media', 'channels'],
              properties: {
                name: {
                  type: 'string',
                  description: 'propertyA name or short description'
                },
                description: {
                  type: 'string',
                  description: 'propertyA description'
                }
              }
            }
          }
        }
      };
      //console.dir(rebased, { colors: true, depth: 20 });
      rebased.should.deep.equal(expectedSpec);
    });
    it('for a multi-level definitions spec, it should return the spec with moved definitions in #/components/schemas and $refs updated accordingly', function() {
      const rebased = rebaseOASDefinitions(multiDefSpec);
      const expectedSpec = {
        openapi: '3.0.2',
        info: { title: 'multi spec', version: '7.0.0-dev1' },
        components: {
          schemas: {
            A: {
              description: 'A',
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'A name'
                },
                description: {
                  type: 'string',
                  description: 'A descr'
                }
              }
            },
            A_A1: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
            A_A2: {
              type: 'object',
              description: 'A2',
              properties: {
                a2Prop: { $ref: '#/components/schemas/A_A1' }
              },
              additionalProperties: false
            },
            B: {
              description: 'B',
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'B name'
                }
              }
            },
            C: {
              description: 'C',
              type: 'object',
              properties: {
                name: {
                  $ref: '#/components/schemas/A_A1'
                },
                description: {
                  type: 'string',
                  description: 'C descr'
                }
              }
            },
            C_C1: {
              type: 'object',
              properties: {
                from: { $ref: '#/components/schemas/C_C1_C11' },
                to: { $ref: '#/components/schemas/C_C1_C11' }
              },
              additionalProperties: false
            },
            C_C1_C11: {
              type: 'object',
              description: 'C11',
              properties: {
                c11Prop: { type: 'string' }
              }
            },
            C_C1_C12: {
              type: 'object',
              description: 'C12',
              properties: {
                c12Prop: { type: 'string' }
              }
            }
          }
        },
        responses: {
          a: {
            description: 'Default/generic error response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/A_A1' } } }
          },
          c: {
            description: 'The requested/specified resource was not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/C' } } }
          }
        }
      };
      //console.dir(rebased, { colors: true, depth: 20 });
      rebased.should.deep.equal(expectedSpec);
    });
  });
  describe('rebaseOASDefinitions() for a spec containing multi-level nested definitions with the same name', function() {
    it('for a multi-level definitions spec, it should return the spec with moved definitions in #/components/schemas having unique names and $refs updated accordingly', function() {
      const rebased = rebaseOASDefinitions(nestedSameNameDefSpec);
      const expectedSpec = {
        openapi: '3.0.2',
        info: { title: 'nested multi def spec with the same name', version: '1.0.0' },
        components: {
          schemas: {
            A_defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
            A_defB: {
              type: 'object',
              properties: {
                abprop: { $ref: '#/components/schemas/A_defA' }
              },
              additionalProperties: false
            },
            B_defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
            B_defB: {
              type: 'object',
              properties: {
                abprop: { $ref: '#/components/schemas/B_defA' }
              },
              additionalProperties: false
            },
            C_defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
            C_defB: {
              type: 'object',
              properties: {
                abprop: { $ref: '#/components/schemas/C_defA' }
              },
              additionalProperties: false
            },
            A: {
              description: 'A',
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },
                description: {
                  type: 'string'
                }
              }
            },
            B: {
              description: 'B',
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },
                description: {
                  type: 'string'
                }
              }
            },
            C: {
              description: 'B',
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },
                description: {
                  type: 'string'
                }
              }
            }
          }
        },
        responses: {
          a: {
            description: 'Default/generic error response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/A_defA' } } }
          },
          c: {
            description: 'The requested/specified resource was not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/C' } } }
          }
        }
      };
      //console.dir(rebased, { colors: true, depth: 20 });
      rebased.should.deep.equal(expectedSpec);
    });
    it('for a multi-level nested definitions spec, it should return the spec with moved definitions in #/components/schemas having unique names and $refs updated accordingly', function() {
      const rebased = rebaseOASDefinitions(multiNestedSameNameDefSpec);
      const expectedSpec = {
        openapi: '3.0.2',
        info: { title: 'nested multi def spec with the same name', version: '1.0.0' },
        components: {
          schemas: {
            A_defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
            A_defB: {
              type: 'object',
              properties: {
                abprop: { $ref: '#/components/schemas/A_defA' }
              },
              additionalProperties: false
            },
            B_defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
            B_defB: {
              type: 'object',
              properties: {
                abprop: { $ref: '#/components/schemas/B_defB_defA' }
              },
              additionalProperties: false
            },
            B_defB_defA: {
              description: 'nested nested definition',
              type: 'string'
            },
            A: {
              description: 'A',
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },
                description: {
                  type: 'string'
                }
              }
            },
            B: {
              description: 'B',
              type: 'object',
              properties: {
                name: {
                  type: 'string'
                },
                description: {
                  type: 'string'
                }
              }
            }
          }
        },
        responses: {
          a: {
            description: 'Default/generic error response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/A_defA' } } }
          },
          c: {
            description: 'The requested/specified resource was not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/B_defA' } } }
          }
        }
      };
      //console.dir(rebased, { colors: true, depth: 20 });
      rebased.should.deep.equal(expectedSpec);
    });
  });
  // tests for errors
  describe('rebaseOASDefinitions() errors', function() {
    it('should throw an Error in case of a not valid spec', function() {
      const spec = { components: { schemas: { a: null } } };
      should.throw(() => rebaseOASDefinitions(spec), Error);
    });
  });
});
