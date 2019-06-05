export const complexSpec = {
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
      global: {
        definitions: {
          hasMetadata: { type: 'object', required: ['_metadata'], properties: { _metadata: { type: 'object' } } },
          hasaId: {
            type: 'object',
            required: ['id_a_c'],
            properties: { id_a_c: { type: 'string', readOnly: true } }
          },
          hasVersion: {
            type: 'object',
            required: ['version'],
            properties: { version: { type: 'integer', minimum: 1 } }
          },
          supportsDraft: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/global/definitions/hasVersion' }],
            properties: { draft: { type: 'boolean', default: false } }
          },
          canBeDisabled: { type: 'object', properties: { enabled: { type: 'boolean', default: true } } },
          objectId: { type: 'string', minLength: 24, maxLength: 24, pattern: '^[0-9a-fA-F]{24}$' },
          nonEmptyString: { type: 'string', minLength: 1 },
          arrayOfStrings: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
          keyMatch: {
            type: 'object',
            required: ['key', 'map'],
            properties: {
              key: { description: '', allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
              map: {
                type: 'object',
                minProperties: 1,
                description: '',
                additionalProperties: {
                  anyOf: [
                    { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                    { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
                  ]
                }
              }
            }
          },
          languageId: {
            type: 'string',

            pattern: '^([a-z]{2,3})(-[A-Z]{2})?$'
          },
          timestamp: { type: 'string', format: 'date-time' },
          validity: {
            type: 'object',
            properties: {
              from: { allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }] },
              to: { allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }] }
            }
          },
          positiveInteger: { title: 'positive number', type: 'integer', minimum: 0 },
          infinite: { title: 'infinite number', type: 'integer', minimum: -1, maximum: -1 },
          infiniteOrPositiveNumber: {
            oneOf: [{ $ref: '#/components/schemas/global/definitions/infinite' }, { $ref: '#/components/schemas/global/definitions/positiveInteger' }]
          }
        }
      },
      common: {
        definitions: {
          notEmptyString: { type: 'string', minLength: 1 },
          languageCode: {
            type: 'string',

            pattern: '^([a-z]{2,3})(-[A-Z]{2})?$'
          }
        }
      },
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
        definitions: {
          total: {
            type: 'object',
            properties: {
              total: { allOf: [{ $ref: '#/components/schemas/global/definitions/infiniteOrPositiveNumber' }] },
              max: {
                allOf: [{ $ref: '#/components/schemas/global/definitions/infiniteOrPositiveNumber' }]
              },
              min: {
                allOf: [{ $ref: '#/components/schemas/global/definitions/infiniteOrPositiveNumber' }]
              },
              initial: {
                allOf: [{ $ref: '#/components/schemas/global/definitions/positiveInteger' }]
              },
              spent: {
                allOf: [{ $ref: '#/components/schemas/global/definitions/positiveInteger' }]
              }
            }
          },
          bus: {
            type: 'object',
            required: ['parent'],
            properties: {
              parent: { allOf: [{ $ref: '#/components/schemas/anp_id' }] },
              validity: { allOf: [{ $ref: '#/components/schemas/global/definitions/validity' }] },
              llls: {
                allOf: [{ $ref: '#/components/schemas/llls' }]
              },
              azerty: { $ref: '#/components/schemas/anp/properties/azerty' },
              blggg: {
                type: 'object',
                properties: {
                  price: { $ref: '#/components/schemas/anp/definitions/price' },
                  bus: {
                    allOf: [{ $ref: '#/components/schemas/anp/definitions/interval' }],
                    type: 'object',
                    properties: {
                      start: { allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }] },
                      due: { allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }] },
                      overage_due: { allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }] }
                    }
                  }
                }
              },
              overage: { $ref: '#/components/schemas/anp/properties/overage' }
            }
          }
        },
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
                key: { type: 'integer', default: 1, minimum: 1 },
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
          owner_mega: { 'x-group': 'general', type: 'string', minLength: 8, writeOnly: true },
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
              last_check: {
                allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }]
              }
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
              delay: { type: 'integer', minimum: 5, maximum: 300, default: 12 },
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
            items: { $ref: '#/components/schemas/a/definitions/bus' },
            default: []
          },
          bus: {
            'x-group': 'blggg',

            type: 'object',
            additionalProperties: false,
            properties: {
              parent: { allOf: [{ $ref: '#/components/schemas/anp_id' }] },
              validity: { allOf: [{ $ref: '#/components/schemas/global/definitions/validity' }] },
              llls: { $ref: '#/components/schemas/a/properties/llls' },
              pingPongs: {
                allOf: [{ $ref: '#/components/schemas/anp/definitions/bucket/properties/total' }]
              },
              littleBy: {
                allOf: [{ $ref: '#/components/schemas/anp/definitions/bucket/properties/total' }]
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
                    total: {
                      allOf: [{ $ref: '#/components/schemas/global/definitions/infiniteOrPositiveNumber' }]
                    },
                    validity: { allOf: [{ $ref: '#/components/schemas/global/definitions/validity' }] },
                    priority: {
                      type: 'number',
                      minimum: 0,
                      default: 50
                    },
                    min: {
                      allOf: [{ $ref: '#/components/schemas/global/definitions/infiniteOrPositiveNumber' }]
                    },
                    ts: {
                      allOf: [{ $ref: '#/components/schemas/global/definitions/timestamp' }]
                    },
                    initial: {
                      allOf: [{ $ref: '#/components/schemas/global/definitions/positiveInteger' }]
                    }
                  }
                }
              },
              totals: {
                type: 'object',
                properties: {
                  pingPongs: { allOf: [{ $ref: '#/components/schemas/a/definitions/total' }] },
                  littleBy: { allOf: [{ $ref: '#/components/schemas/a/definitions/total' }] }
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
        properties: {}
      },
      c: {
        type: 'object',
        required: ['id', 'jojo'],
        allOf: [{ $ref: '#/components/schemas/global/definitions/canBeDisabled' }, { $ref: '#/components/schemas/global/definitions/hasaId' }],
        properties: {
          id: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          description: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          defaultLanguage: { $ref: '#/components/schemas/global/definitions/languageId' },
          nickname: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          pic: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          tags: { allOf: [{ $ref: '#/components/schemas/global/definitions/arrayOfStrings' }] },
          todoListId: { type: 'string' },
          videogameInfo: {
            type: 'object',

            minProperties: 1,
            properties: {
              todonald: { $ref: '#/components/schemas/global/definitions/keyMatch' },
              toTags: { $ref: '#/components/schemas/global/definitions/keyMatch' }
            }
          },
          jojo: {
            type: 'object',
            description: '',
            minProperties: 1,
            'x-patternProperties': { '^([a-z]{2,3})(-[A-Z]{2})?$': { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
          }
        }
      },
      d: {
        type: 'object',
        required: ['name', 'languages', 'defaultLanguage', 'meme', 'chhs'],
        allOf: [
          { $ref: '#/components/schemas/global/definitions/hasaId' },
          { $ref: '#/components/schemas/global/definitions/supportsDraft' },
          { $ref: '#/components/schemas/global/definitions/canBeDisabled' },
          { $ref: '#/components/schemas/d/definitions/commonSettings' }
        ],
        definitions: {
          majorTom: { enum: ['disabled', 'donald', 'visitor', 'ch'] },
          memeSettings: {
            type: 'object',

            required: ['icecream', 'fruit', 'songs'],
            properties: {
              icecream: { $ref: '#/components/schemas/d/definitions/majorTom' },
              fruit: { $ref: '#/components/schemas/d/definitions/majorTom' },
              songs: { $ref: '#/components/schemas/d/definitions/majorTom' }
            },
            additionalProperties: false
          },
          tags: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
          rrtnSettings: {
            type: 'object',

            properties: {
              color: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              tags: { $ref: '#/components/schemas/d/definitions/tags' },
              optionalTags: { $ref: '#/components/schemas/d/definitions/tags' },
              assignmentTags: { $ref: '#/components/schemas/d/definitions/tags' },
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
          valueInterval: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, additionalProperties: false },
          timeInterval: {
            type: 'object',

            properties: {
              minutes: { $ref: '#/components/schemas/d/definitions/valueInterval' },
              hours: { $ref: '#/components/schemas/d/definitions/valueInterval' },
              dayOfMonth: { $ref: '#/components/schemas/d/definitions/valueInterval' },
              dayOfWeek: { $ref: '#/components/schemas/d/definitions/valueInterval' },
              month: { $ref: '#/components/schemas/d/definitions/valueInterval' },
              year: { $ref: '#/components/schemas/d/definitions/valueInterval' }
            },
            additionalProperties: false
          },
          openingHours: {
            type: 'object',

            properties: {
              intervals: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/timeInterval' } },
              exceptions: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/timeInterval' } }
            },
            additionalProperties: false
          },
          pingPongMode: {
            type: 'object',
            required: ['offer'],
            properties: {
              offer: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              todoListId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              autoStart: { type: 'boolean' },
              rrtn: { $ref: '#/components/schemas/d/definitions/rrtnSettings' },
              openingHours: { $ref: '#/components/schemas/d/definitions/openingHours' }
            }
          },
          pingPongAlternatives: {
            anyOf: [
              { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              { $ref: '#/components/schemas/d/definitions/pingPongMode' },
              { type: 'array', items: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' } },
              {
                type: 'object',
                required: ['or'],
                additionalProperties: false,
                properties: { or: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' } } }
              }
            ]
          },
          pingPongModes: {
            type: 'object',
            properties: {
              gag: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' },
              nodonalds: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' },
              timeout: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' },
              error: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' },
              closed: { $ref: '#/components/schemas/d/definitions/pingPongAlternatives' }
            }
          },
          commonSettings: {
            type: 'object',
            properties: {
              meme: { $ref: '#/components/schemas/d/definitions/memeSettings' },
              rrtn: { $ref: '#/components/schemas/d/definitions/rrtnSettings' },
              openingHours: { $ref: '#/components/schemas/d/definitions/openingHours' },
              pingPongModes: { $ref: '#/components/schemas/d/definitions/pingPongModes' },
              schoolAddress: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
            }
          },
          todoListSettings: {
            type: 'object',
            properties: {
              todoListIds: { $ref: '#/components/schemas/global/definitions/arrayOfStrings' },
              surveyId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
            }
          },
          languageSettings: {
            type: 'object',
            required: ['defaultLanguage'],
            properties: {
              type: { enum: ['const', 'detect'], default: 'const' },
              defaultLanguage: { $ref: '#/components/schemas/global/definitions/languageId' }
            }
          },
          lemonDetectionGuest: {
            type: 'object',
            required: ['type'],
            properties: {
              mapping: {
                type: 'object',

                additionalProperties: { $ref: '#/components/schemas/global/definitions/languageId' }
              }
            },
            oneOf: [
              { type: 'object', properties: { type: { enum: ['page', 'domain', 'ua', 'url', 'geoip'] } } },
              {
                type: 'object',
                required: ['code'],
                properties: { type: { enum: ['js'] }, code: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
              }
            ]
          },
          lemonSettings: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/d/definitions/languageSettings' }],
            properties: { strategies: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/lemonDetectionGuest' } } }
          },
          webAction: {
            type: 'object',
            properties: { once: { type: 'boolean', default: false }, blocking: { type: 'boolean', default: false } },
            oneOf: [
              { type: 'object', required: ['code'], properties: { code: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } } },
              { type: 'object', required: ['url'], properties: { url: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } } }
            ]
          },
          miao: {
            type: 'object',
            required: ['op'],
            oneOf: [
              {
                type: 'object',

                required: ['miaos'],
                properties: { op: { enum: ['and', 'or'] }, miaos: { type: 'array', item: { $ref: '#/components/schemas/d/definitions/miao' } } }
              },
              {
                type: 'object',

                required: ['code'],
                properties: { op: { enum: ['js'] }, code: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
              },
              {
                type: 'object',

                required: ['leftId'],
                properties: { leftId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
                allOf: [
                  {
                    oneOf: [
                      {
                        type: 'object',
                        require: ['rightId'],
                        properties: { rightId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
                      },
                      { type: 'object', require: ['right'] }
                    ]
                  },
                  {
                    oneOf: [
                      {
                        type: 'object',

                        properties: {
                          op: { enum: ['eq', 'ne', 'starts', 'ends', 'contains', 'matches'] },
                          right: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                        }
                      },
                      {
                        type: 'object',

                        properties: { op: { enum: ['eq', 'ne', 'lt', 'le', 'gt', 'ge'] }, right: { type: 'number' } }
                      },
                      { type: 'object', properties: { op: { enum: ['eq', 'ne'] }, right: { type: 'boolean' } } },
                      {
                        type: 'object',

                        properties: { op: { enum: ['eq', 'ne'] }, right: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
                      }
                    ]
                  }
                ]
              }
            ]
          },
          toywSettings: {
            type: 'object',
            required: ['ttplId'],
            properties: {
              ttplId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              ttplHash: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              v_vs: { type: 'object', additionalProperties: { type: ['string', 'boolean'] } },
              strings: { type: 'array', items: { $ref: '#/components/schemas/string' } },
              customCss: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              selector: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
            }
          },
          gagtoywSettings: { $ref: '#/components/schemas/d/definitions/toywSettings' },
          gagWebActions: {
            type: 'object',
            properties: {
              'gag-init': { $ref: '#/components/schemas/d/definitions/webAction' }
            }
          },
          chhWebActions: {
            oneOf: [
              { $ref: '#/components/schemas/d/definitions/gagWebActions' },
              { type: 'object', properties: { 'page-load': { $ref: '#/components/schemas/d/definitions/webAction' } } }
            ]
          },
          stringMatchingmiaos: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'pattern'],
              properties: {
                type: { enum: ['equals', 'starts', 'ends', 'contains', 'matches'] },
                pattern: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
              }
            }
          },
          epp: {
            type: 'object',
            required: ['id', 'name'],
            allOf: [
              { $ref: '#/components/schemas/global/definitions/canBeDisabled' },
              { $ref: '#/components/schemas/d/definitions/commonSettings' },
              { $ref: '#/components/schemas/d/definitions/todoListSettings' }
            ],
            properties: {
              id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              name: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              language: { $ref: '#/components/schemas/d/definitions/languageSettings' },
              settings: { type: 'object' },
              settingsToken: { type: 'string' }
            }
          },
          webepp: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/d/definitions/epp' }],
            properties: {
              language: { $ref: '#/components/schemas/d/definitions/lemonSettings' },
              includedUrls: { $ref: '#/components/schemas/d/definitions/stringMatchingmiaos' },
              excludedUrls: { $ref: '#/components/schemas/d/definitions/stringMatchingmiaos' }
            }
          },
          gag: {
            type: 'object',
            required: ['name', 'eppIds'],
            allOf: [
              { $ref: '#/components/schemas/global/definitions/canBeDisabled' },
              { $ref: '#/components/schemas/d/definitions/commonSettings' },
              { $ref: '#/components/schemas/d/definitions/todoListSettings' }
            ],
            properties: {
              name: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              eppIds: { $ref: '#/components/schemas/global/definitions/arrayOfStrings' }
            }
          },
          webgag: {
            type: 'object',
            required: ['toyw'],
            allOf: [{ $ref: '#/components/schemas/d/definitions/gag' }],
            properties: {
              actions: { $ref: '#/components/schemas/d/definitions/gagWebActions' },
              miaos: { $ref: '#/components/schemas/d/definitions/miao' },
              toyw: { $ref: '#/components/schemas/d/definitions/toywSettings' }
            }
          },
          chh: {
            type: 'object',
            required: ['epps'],
            allOf: [
              { $ref: '#/components/schemas/global/definitions/canBeDisabled' },
              { $ref: '#/components/schemas/d/definitions/commonSettings' },
              { $ref: '#/components/schemas/d/definitions/todoListSettings' }
            ],
            properties: { epps: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/epp' } } }
          },
          webchh: {
            type: 'object',
            required: ['gags', 'pingPong'],
            allOf: [{ $ref: '#/components/schemas/d/definitions/chh' }],
            properties: {
              epps: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/webepp' } },
              gags: { type: 'array', items: { $ref: '#/components/schemas/d/definitions/webgag' } },
              chhWebActions: { $ref: '#/components/schemas/d/definitions/chhWebActions' },
              pingPong: { $ref: '#/components/schemas/d/definitions/toywSettings' }
            }
          },
          jimmy: {
            type: 'object',
            additionalProperties: false,
            properties: {
              abroad: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              memeHook: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              ctiEvents: { $ref: '#/components/schemas/global/definitions/arrayOfStrings' }
            }
          }
        },
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          languages: {
            type: 'array',

            items: { $ref: '#/components/schemas/global/definitions/languageId' }
          },
          defaultLanguage: { $ref: '#/components/schemas/global/definitions/languageId' },
          validity: {
            type: 'object',

            properties: {
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' }
            },
            additionalProperties: false
          },
          jimmy: { $ref: '#/components/schemas/d/definitions/jimmy' },
          _chhs: {
            type: 'object',
            properties: { web: { $ref: '#/components/schemas/d/definitions/webchh' } },
            additionalProperties: { $ref: '#/components/schemas/d/definitions/chh' }
          },
          hash: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { readOnly: true }] }
        }
      },
      e: {
        type: 'object',
        required: ['id', 'scope'],
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
        definitions: { todoList: {}, cccchh: {} },
        properties: {
          dId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          version: { type: 'number', writeOnly: true },
          chhId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          eppId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          gagId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          mpr: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          data: { allOf: [{ $ref: '#/components/schemas/ccc/definitions/todoList' }, { writeOnly: true }] },
          lang: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          color: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          tags: { allOf: [{ $ref: '#/components/schemas/global/definitions/arrayOfStrings' }, { writeOnly: true }] },
          optionalTags: { allOf: [{ $ref: '#/components/schemas/global/definitions/arrayOfStrings' }, { writeOnly: true }] },
          assignmentTags: { allOf: [{ $ref: '#/components/schemas/global/definitions/arrayOfStrings' }, { writeOnly: true }] },
          uuuu: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          uuut: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          nick: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          first_uri: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          first_title: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          ext_id: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          info: {},
          mobile: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }, { writeOnly: true }] },
          cccchh: { allOf: [{ $ref: '#/components/schemas/ccc/definitions/cccchh' }, { writeOnly: true }] },
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
          language: { $ref: '#/components/schemas/common/definitions/languageCode' },
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
                      type: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
                      amazingWow: { $ref: '#/components/schemas/common/definitions/notEmptyString' }
                    },
                    oneOf: [
                      { type: 'object', properties: { type: { enum: ['bearer'] } } },
                      {
                        type: 'object',
                        required: ['xyz'],
                        properties: { type: { enum: ['basic'] }, xyz: { $ref: '#/components/schemas/common/definitions/notEmptyString' } }
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
          body: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
          payload: { type: 'string' }
        }
      },
      ttch: {
        type: 'object',
        required: ['code', 'type', 'url', 'meta'],
        properties: {
          code: { enum: ['message'] },
          type: { enum: ['attachment'] },
          url: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
          meta: {
            type: 'object',
            required: ['mimetype'],
            properties: {
              originalUrl: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              originalUrlHash: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              originalId: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              originalName: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              mimetype: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              desc: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              key: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
              size: { type: 'number' },
              ref: { $ref: '#/components/schemas/common/definitions/notEmptyString' }
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
          action_code: { $ref: '#/components/schemas/common/definitions/notEmptyString' },
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
        definitions: {
          abstractmemoNemo: {
            type: 'object',
            required: ['type'],
            properties: {
              id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              type: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              labelId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              format: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
            }
          },
          metamemoNemo: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/abstractmemoNemo' }],
            oneOf: [
              { type: 'object', properties: { format: { enum: ['break'] } } },
              {
                type: 'object',
                required: ['id'],
                properties: { format: { enum: ['message'] }, message: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
              },
              { type: 'object', required: ['id', 'labelId'], properties: { format: { enum: ['section'] }, implicit: { type: 'boolean' } } }
            ],
            properties: { type: { enum: ['meta'] } }
          },
          promptIds: {
            type: 'array',

            items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
          },
          dfdf: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/abstractmemoNemo' }],
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
              promptIds: { $ref: '#/components/schemas/qwerty/definitions/promptIds' }
            }
          },
          stringmemoNemo: {
            type: 'object',
            required: ['type'],
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/dfdf' }],
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
          selectmemoNemo: {
            type: 'object',
            required: ['type'],
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/dfdf' }],
            properties: {
              type: { enum: ['dropdown'] },
              options: { type: 'object', additionalProperties: { type: 'string' }, minProperties: 1 }
            }
          },
          numbermemoNemo: {
            type: 'object',
            required: ['type'],
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/dfdf' }],
            properties: {
              type: { enum: ['number'] },
              format: { enum: ['number', 'rating'], default: 'number' },
              defaultConstant: { type: 'number' },
              min: { type: 'integer' },
              max: { type: 'integer' }
            }
          },
          ratingmemoNemo: {
            type: 'object',
            required: ['format', 'style'],
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/numbermemoNemo' }],
            properties: { format: { enum: ['rating'] }, style: { type: 'string' } }
          },
          booleanmemoNemo: {
            type: 'object',
            required: ['type'],
            allOf: [{ $ref: '#/components/schemas/qwerty/definitions/dfdf' }],
            properties: {
              type: { enum: ['boolean'] },
              format: { enum: ['checkbox', 'radio'], default: 'checkbox' },
              defaultConstant: { type: 'boolean' },
              trueLabel: { type: 'string' },
              falseLabel: { type: 'string' },
              validation: { type: 'boolean' }
            }
          }
        },
        properties: {
          id: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          labelId: { type: 'string' },
          type: { enum: ['form', 'dialog', 'c'], default: 'form' },
          memoNemos: {
            type: 'array',
            items: {
              anyOf: [
                { $ref: '#/components/schemas/qwerty/definitions/metamemoNemo' },
                { $ref: '#/components/schemas/qwerty/definitions/stringmemoNemo' },
                { $ref: '#/components/schemas/qwerty/definitions/selectmemoNemo' },
                { $ref: '#/components/schemas/qwerty/definitions/numbermemoNemo' },
                { $ref: '#/components/schemas/qwerty/definitions/ratingmemoNemo' },
                { $ref: '#/components/schemas/qwerty/definitions/booleanmemoNemo' }
              ]
            }
          },
          filters: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
          jojo: {
            type: 'object',
            additionalProperties: false,
            'x-patternProperties': { '^([a-z]{2,3})(-[A-Z]{2})?$': { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
          },
          promptIds: { type: 'object', additionalProperties: { $ref: '#/components/schemas/qwerty/definitions/promptIds' } }
        }
      },
      anp: {
        type: 'object',
        required: ['id', 'name'],
        definitions: {
          multilingual: {
            oneOf: [{ type: 'string' }, { type: 'object', properties: { it: { type: 'string' }, en: { type: 'string' }, fr: { type: 'string' } } }]
          },
          singlePrice: { type: 'integer', minimum: 0 },
          price: {
            type: 'object',
            required: ['eur', 'usd'],
            properties: {
              eur: { $ref: '#/components/schemas/anp/definitions/singlePrice' },
              usd: { $ref: '#/components/schemas/anp/definitions/singlePrice' }
            },
            additionalProperties: { $ref: '#/components/schemas/anp/definitions/singlePrice' }
          },
          interval: {
            type: 'object',
            properties: {
              frequency: { enum: ['day', 'month', 'year'], type: 'string' },
              period: { type: 'integer', minimum: 0 }
            }
          },
          bucket: {
            type: 'object',
            allOf: [{ $ref: '#/components/schemas/anp/definitions/interval' }],
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
          reddddOverage: {
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
                    price: { $ref: '#/components/schemas/anp/definitions/price' }
                  }
                }
              }
            }
          }
        },
        properties: {
          id: { type: 'string' },
          parent: {
            type: 'string'
          },
          name: { allOf: [{ $ref: '#/components/schemas/anp/definitions/multilingual' }] },
          description: { allOf: [{ $ref: '#/components/schemas/anp/definitions/multilingual' }] },
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
                allOf: [{ $ref: '#/components/schemas/anp/definitions/bucket' }]
              },
              littleBy: {
                allOf: [{ $ref: '#/components/schemas/anp/definitions/bucket' }]
              }
            },
            additionalProperties: {
              allOf: [{ $ref: '#/components/schemas/anp/definitions/bucket' }]
            }
          },
          blggg: {
            type: 'object',
            properties: {
              price: { $ref: '#/components/schemas/anp/definitions/price' },
              bus: { $ref: '#/components/schemas/anp/definitions/interval' }
            }
          },
          overage: {
            type: 'object',
            properties: {
              blggg: { allOf: [{ $ref: '#/components/schemas/anp/definitions/interval' }] },
              littleBy: { $ref: '#/components/schemas/anp/definitions/reddddOverage' },
              pingPongs: { $ref: '#/components/schemas/anp/definitions/reddddOverage' }
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
        definitions: {
          transmissionmiaos: { enum: ['required', 'optional', 'off'] },
          transmissionVia: { enum: ['net', 'pstn'] },
          cccmemeSpec: {
            type: 'object',
            required: ['tx', 'rx'],
            properties: {
              tx: { $ref: '#/components/schemas/super-show/definitions/transmissionmiaos' },
              rx: { $ref: '#/components/schemas/super-show/definitions/transmissionmiaos' },
              engine: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              via: { $ref: '#/components/schemas/super-show/definitions/transmissionVia' }
            }
          },
          cccmemeOffer: {
            type: 'object',
            properties: {
              icecream: { $ref: '#/components/schemas/super-show/definitions/cccmemeSpec' },
              fruit: { $ref: '#/components/schemas/super-show/definitions/cccmemeSpec' },
              songs: { $ref: '#/components/schemas/super-show/definitions/cccmemeSpec' },
              Sharing: { $ref: '#/components/schemas/super-show/definitions/cccmemeSpec' }
            }
          }
        },
        properties: {
          id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
          description: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
          offer: { $ref: '#/components/schemas/super-show/definitions/cccmemeOffer' }
        }
      },
      pfl: {
        type: 'object',
        definitions: {
          amazingPropcopes: {
            items: {
              type: 'string',
              pattern: '^-?(?:[*]|\\w+)(?:[.](?:[*]|\\w+))?$'
            },
            type: 'array'
          }
        },
        properties: {
          id: { type: 'string' },
          resources: { type: 'object', additionalProperties: { type: 'boolean' } },
          scopes: {
            type: 'object',
            properties: {
              owner: { allOf: [{ $ref: '#/components/schemas/pfl/definitions/amazingPropcopes' }] },
              admin: {
                allOf: [{ $ref: '#/components/schemas/pfl/definitions/amazingPropcopes' }]
              },
              supervisor: {
                allOf: [{ $ref: '#/components/schemas/pfl/definitions/amazingPropcopes' }]
              },
              donald: { allOf: [{ $ref: '#/components/schemas/pfl/definitions/amazingPropcopes' }] },
              auditor: { allOf: [{ $ref: '#/components/schemas/pfl/definitions/amazingPropcopes' }] }
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
        definitions: {
          tw_lllService: {
            type: 'object',
            required: ['auth'],
            properties: {
              type: { enum: ['tw_lll'] },
              auth: {
                type: 'object',
                required: ['sid', 'token'],
                properties: {
                  sid: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  token: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                }
              }
            }
          },
          TestService: {
            type: 'object',
            properties: {
              url: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              auth: {
                type: 'object',
                required: ['type', 'amazingWow'],
                properties: { amazingWow: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
                oneOf: [
                  {
                    type: 'object',
                    required: ['xyz'],
                    properties: { type: { enum: ['basic'] }, xyz: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
                  },
                  { type: 'object', properties: { type: { enum: ['bearer'] } }, not: { type: 'object', required: ['xyz'] } }
                ]
              }
            }
          },
          pull: {
            type: 'object',
            required: ['url', 'events'],
            allOf: [{ $ref: '#/components/schemas/terzo/definitions/TestService' }],
            properties: {
              type: { enum: ['pull'] },
              events: { type: 'array', items: { enum: ['new', 'end', 'change', 'finalized', 'message'] }, minItems: 1 }
            }
          },
          abroad: {
            type: 'object',
            required: ['url'],
            allOf: [{ $ref: '#/components/schemas/terzo/definitions/TestService' }],
            properties: { type: { enum: ['extrouter'] } }
          },
          memeHook: {
            type: 'object',
            required: ['url'],
            allOf: [{ $ref: '#/components/schemas/terzo/definitions/TestService' }],
            properties: { type: { enum: ['memehook'] } }
          },
          carc: {
            type: 'object',
            required: ['settings'],
            properties: {
              engine: { enum: ['car'] },
              settings: {
                type: 'object',
                required: ['token'],
                properties: {
                  token: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  startEvent: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                }
              }
            }
          },
          carV2c: {
            type: 'object',
            required: ['settings'],
            properties: {
              engine: { enum: ['carV2'] },
              settings: {
                type: 'object',
                required: ['projectId', 'privateKey', 'eEmail', 'eId', 'startEvent'],
                properties: {
                  projectId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  privateKey: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  eEmail: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  eId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  languageCode: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  startEvent: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                }
              }
            }
          },
          airplanec: {
            type: 'object',
            required: ['settings'],
            properties: {
              engine: { enum: ['airplane'] },
              settings: {
                type: 'object',
                required: ['placeId', 'username', 'mega'],
                properties: {
                  placeId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  username: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  mega: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  endEventKey: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  version: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                }
              }
            }
          },
          sweetsc: {
            type: 'object',
            required: ['settings'],
            properties: {
              engine: { enum: ['sweets'] },
              settings: {
                type: 'object',
                required: ['directLineSiteId', 'amazingWow', 'autoConvertMessages'],
                properties: {
                  directLineSiteId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  amazingWow: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  startMessage: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  autoConvertMessages: { type: 'boolean' },
                  videogameKey: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
                  videogameValue: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                }
              }
            }
          },
          customc: { type: 'object', required: ['url'] },
          cdonald: {
            type: 'object',
            required: ['engine'],
            allOf: [{ $ref: '#/components/schemas/terzo/definitions/TestService' }],
            properties: {
              type: { enum: ['c.donald'] },
              engine: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              requestFilters: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
              responseFilters: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
            },
            oneOf: [
              { $ref: '#/components/schemas/terzo/definitions/carc' },
              { $ref: '#/components/schemas/terzo/definitions/carV2c' },
              { $ref: '#/components/schemas/terzo/definitions/airplanec' },
              { $ref: '#/components/schemas/terzo/definitions/sweetsc' },
              { $ref: '#/components/schemas/terzo/definitions/customc' }
            ]
          },
          cFilter: {
            type: 'object',
            required: ['url'],
            allOf: [{ $ref: '#/components/schemas/terzo/definitions/TestService' }],
            properties: { type: { enum: ['c.filter'] }, requests: { type: 'boolean' }, responses: { type: 'boolean' } }
          }
        },
        properties: {
          id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
          type: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
        },
        oneOf: [
          { $ref: '#/components/schemas/terzo/definitions/tw_lllService' },
          { $ref: '#/components/schemas/terzo/definitions/pull' },
          { $ref: '#/components/schemas/terzo/definitions/abroad' },
          { $ref: '#/components/schemas/terzo/definitions/memeHook' },
          { $ref: '#/components/schemas/terzo/definitions/cdonald' },
          { $ref: '#/components/schemas/terzo/definitions/cFilter' }
        ]
      },
      xyz: {
        type: 'object',
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
        definitions: {
          meme: {
            anyOf: [{ type: 'boolean' }, { type: 'number', minimum: -1 }],
            default: 0
          }
        },
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
              { title: 'Set language', allOf: [{ $ref: '#/components/schemas/global/definitions/languageId' }] },
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/hasaId' }],
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
        allOf: [{ $ref: '#/components/schemas/global/definitions/supportsDraft' }],
        definitions: {
          sha256: { type: 'string', pattern: '[0-9a-fA-F]{64}' },
          v_v: {
            type: 'object',
            required: ['id', 'type', 'nameId'],
            properties: {
              id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              nameId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              categoryIds: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } },
              descriptionId: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              priority: { type: 'integer' },
              hidden: { type: 'boolean', default: false },
              required: { type: 'boolean', default: false }
            },
            oneOf: [
              {
                type: 'object',
                properties: {
                  type: { enum: ['color', 'file', 'string', 'unit', 'border-style', 'multi-unit', 'border', 'box-shadow'] },
                  defaultValue: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
                }
              },
              { type: 'object', properties: { type: { enum: ['boolean'] }, defaultValue: { type: 'boolean' } } },
              {
                type: 'object',
                required: ['options'],
                properties: {
                  type: { enum: ['enum'] },
                  defaultValue: { type: 'string' },
                  options: { type: 'array', items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' } }
                }
              }
            ]
          },
          ssetttt: {
            type: 'object',
            required: ['id', 'path'],
            properties: {
              id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              path: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              hash: { $ref: '#/components/schemas/toyw/definitions/sha256' },
              type: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
              size: { type: 'integer' }
            }
          }
        },
        properties: {
          id: { $ref: '#/components/schemas/global/definitions/nonEmptyString' },
          type: { enum: ['gag', 'pingPong'] },
          thumbnailId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          stringIds: {
            type: 'array',

            items: { $ref: '#/components/schemas/global/definitions/nonEmptyString' }
          },
          htmlId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          scssId: { allOf: [{ $ref: '#/components/schemas/global/definitions/nonEmptyString' }] },
          ssetttts: {
            type: 'array',

            items: { $ref: '#/components/schemas/toyw/definitions/ssetttt' }
          },
          v_vs: {
            type: 'array',

            items: { $ref: '#/components/schemas/toyw/definitions/v_v' }
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
      wwww_id: { type: 'string', enum: ['local'] }
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
      skip: { name: 'skip', in: 'query', schema: { type: 'integer', default: 0, minimum: 0 } },
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
          '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/b' } } } },
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
          '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/d' } } } },
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
                        lang: { $ref: '#/components/schemas/global/definitions/languageId' },
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
          '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/ttpl' } } } },
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
          '200': { content: { 'b/json': { schema: { $ref: '#/components/schemas/v_v' } } } },
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
export const simpleSpec = {
  openapi: '3.0.2',
  info: { title: 'Test Server REST API v3', version: '7.0.0-dev1' },
  components: {
    schemas: {
      a: {
        description: 'Test',
        type: 'object',
        required: ['name'],
        definitions: {
          valueInterval: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, additionalProperties: false },
          timeInterval: {
            type: 'object',
            description: 'Describes an interval of time as a possibly recurring pattens',
            properties: {
              minutes: { $ref: '#/components/schemas/a/definitions/valueInterval' },
              hours: { $ref: '#/components/schemas/a/definitions/valueInterval' },
              dayOfMonth: { $ref: '#/components/schemas/a/definitions/valueInterval' },
              dayOfWeek: { $ref: '#/components/schemas/a/definitions/valueInterval' },
              month: { $ref: '#/components/schemas/a/definitions/valueInterval' },
              year: { $ref: '#/components/schemas/a/definitions/valueInterval' }
            },
            additionalProperties: false
          },
          a1: {
            type: 'object',
            description: 'a1',
            properties: {
              intervals: { type: 'array', items: { $ref: '#/components/schemas/a/definitions/timeInterval' } },
              exceptions: { type: 'array', items: { $ref: '#/components/schemas/a/definitions/timeInterval' } }
            },
            additionalProperties: false
          }
        },
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
export const nestedDefinitionsSpec = {
  openapi: '3.0.2',
  info: { title: 'nestedDefinitionsSpec', version: '7.0.0-dev1' },
  components: {
    schemas: {
      propertyA: {
        type: 'object',
        required: ['name', 'languages', 'defaultLanguage', 'media', 'channels'],
        definitions: {
          valueInterval: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, additionalProperties: false },
          timeInterval: {
            type: 'object',
            properties: {
              minutes: { $ref: '#/components/schemas/propertyA/definitions/valueInterval' },
              hours: { $ref: '#/components/schemas/propertyA/definitions/valueInterval' },
              dayOfMonth: { $ref: '#/components/schemas/propertyA/definitions/valueInterval' },
              dayOfWeek: { $ref: '#/components/schemas/propertyA/definitions/valueInterval' },
              month: { $ref: '#/components/schemas/propertyA/definitions/valueInterval' },
              year: { $ref: '#/components/schemas/propertyA/definitions/valueInterval' }
            },
            additionalProperties: false
          },
          openingHours: {
            type: 'object',
            description: 'Opening hours of the propertyA',
            definitions: {
              defA: {
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
              }
            },
            properties: {
              intervals: { type: 'array', items: { $ref: '#/components/schemas/propertyA/definitions/timeInterval' } },
              exceptions: { type: 'array', items: { $ref: '#/components/schemas/propertyA/definitions/timeInterval' } },
              aFoo: {
                $ref: '#/components/schemas/propertyA/definitions/openingHours/definitions/defA'
              }
            },
            additionalProperties: false
          }
        },
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
export const multiDefSpec = {
  openapi: '3.0.2',
  info: { title: 'multi spec', version: '7.0.0-dev1' },
  components: {
    schemas: {
      A: {
        description: 'A',
        type: 'object',
        definitions: {
          A1: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
          A2: {
            type: 'object',
            description: 'A2',
            properties: {
              a2Prop: { $ref: '#/components/schemas/A/definitions/A1' }
            },
            additionalProperties: false
          }
        },
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
        definitions: {
          C1: {
            type: 'object',
            properties: {
              from: { $ref: '#/components/schemas/C/definitions/C1/definitions/C11' },
              to: { $ref: '#/components/schemas/C/definitions/C1/definitions/C11' }
            },
            additionalProperties: false,
            definitions: {
              C11: {
                type: 'object',
                description: 'C11',
                properties: {
                  c11Prop: { type: 'string' }
                }
              },
              C12: {
                type: 'object',
                description: 'C12',
                properties: {
                  c12Prop: { type: 'string' }
                }
              }
            }
          }
        },
        properties: {
          name: {
            $ref: '#/components/schemas/A/definitions/A1'
          },
          description: {
            type: 'string',
            description: 'C descr'
          }
        }
      }
    }
  },
  responses: {
    a: {
      description: 'Default/generic error response',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/A/definitions/A1' } } }
    },
    c: {
      description: 'The requested/specified resource was not found',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/C' } } }
    }
  }
};
export const nestedSameNameDefSpec = {
  openapi: '3.0.2',
  info: { title: 'nested multi def spec with the same name', version: '1.0.0' },
  components: {
    schemas: {
      A: {
        description: 'A',
        type: 'object',
        definitions: {
          defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
          defB: {
            type: 'object',
            properties: {
              abprop: { $ref: '#/components/schemas/A/definitions/defA' }
            },
            additionalProperties: false
          }
        },
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
        definitions: {
          defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
          defB: {
            type: 'object',
            properties: {
              abprop: { $ref: '#/components/schemas/B/definitions/defA' }
            },
            additionalProperties: false
          }
        },
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
        definitions: {
          defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
          defB: {
            type: 'object',
            properties: {
              abprop: { $ref: '#/components/schemas/C/definitions/defA' }
            },
            additionalProperties: false
          }
        },
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
      content: { 'application/json': { schema: { $ref: '#/components/schemas/A/definitions/defA' } } }
    },
    c: {
      description: 'The requested/specified resource was not found',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/C' } } }
    }
  }
};
export const multiNestedSameNameDefSpec = {
  openapi: '3.0.2',
  info: { title: 'nested multi def spec with the same name', version: '1.0.0' },
  components: {
    schemas: {
      A: {
        description: 'A',
        type: 'object',
        definitions: {
          defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
          defB: {
            type: 'object',
            properties: {
              abprop: { $ref: '#/components/schemas/A/definitions/defA' }
            },
            additionalProperties: false
          }
        },
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
        definitions: {
          defA: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
          defB: {
            type: 'object',
            definitions: {
              defA: {
                type: 'string',
                description: 'nested nested definition'
              }
            },
            properties: {
              abprop: { $ref: '#/components/schemas/B/definitions/defB/definitions/defA' }
            },
            additionalProperties: false
          }
        },
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
      content: { 'application/json': { schema: { $ref: '#/components/schemas/A/definitions/defA' } } }
    },
    c: {
      description: 'The requested/specified resource was not found',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/B/definitions/defA' } } }
    }
  }
};
export const jsonSchema = {
  $schema: 'http://json-schema.org/schema#',
  title: 'A JSON Schema',
  type: 'object',
  definitions: {
    A1: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
    A2: {
      type: 'object',
      description: 'A2',
      properties: {
        a2Prop: { $ref: '#/components/schemas/A/definitions/A1' }
      },
      additionalProperties: false
    }
  },
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
};
export const notAJsonSchema = {
  title: 'A JSON Schema',
  type: 'object',
  definitions: {
    A1: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } } },
    A2: {
      type: 'object',
      description: 'A2',
      properties: {
        a2Prop: { $ref: '#/components/schemas/A/definitions/A1' }
      },
      additionalProperties: false
    }
  },
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
};
