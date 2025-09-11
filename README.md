# arrest

A powerful OpenAPI v3.1 compliant REST framework for Node.js with comprehensive MongoDB support, JSON Schema validation, authentication, and authorization. Build production-ready RESTful APIs in minutes with automatic OpenAPI documentation generation.

[![npm version](https://img.shields.io/npm/v/arrest.svg)](https://www.npmjs.com/package/arrest)
[![CI](https://github.com/vivocha/arrest/actions/workflows/ci.yml/badge.svg)](https://github.com/vivocha/arrest/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/vivocha/arrest/badge.svg?branch=master)](https://coveralls.io/github/vivocha/arrest?branch=master)

## Features

- ✅ **OpenAPI v3.1 Compliant**: Automatic OpenAPI specification generation with full v3.1 support including JSON Schema Draft 2020-12
- ✅ **MongoDB Integration**: Built-in MongoDB operations (CRUD) with advanced querying
- ✅ **JSON Schema Validation**: Comprehensive input validation using JSON Schema
- ✅ **Authentication & Authorization**: OAuth2 scopes and CASL ability-based permissions
- ✅ **Resource Query Language (RQL)**: Advanced querying with filtering, sorting, and pagination
- ✅ **Express.js Integration**: Works seamlessly with existing Express.js applications
- ✅ **CSV Export**: Built-in CSV export functionality for data endpoints
- ✅ **JSON-RPC Support**: Dual REST and JSON-RPC endpoint support
- ✅ **Pipeline Operations**: Complex data processing with pipeline support
- ✅ **TypeScript Support**: Full TypeScript definitions included
- ✅ **Modern ES Modules**: Supports both ESM and CommonJS

## Installation

```bash
# npm
npm install arrest

# pnpm  
pnpm add arrest

# yarn
yarn add arrest
```

## Quick Start

### Basic REST API

```javascript
import { API, MongoResource } from 'arrest';

const api = new API({
  info: {
    title: 'My API',
    version: '1.0.0'
  }
});

// Add a MongoDB-backed resource
api.addResource(new MongoResource('mongodb://localhost:27017/mydb', {
  name: 'User',
  collection: 'users'
}));

// Start the server
api.listen(3000);
console.log('API running at http://localhost:3000');
console.log('OpenAPI spec at http://localhost:3000/openapi.json');
```

This creates a full CRUD API for users with the following endpoints:
- `GET /users` - List users with filtering, sorting, pagination
- `POST /users` - Create a new user
- `GET /users/{id}` - Get user by ID
- `PUT /users/{id}` - Update user
- `PATCH /users/{id}` - Partial update user with JSON Patch
- `DELETE /users/{id}` - Delete user

### Testing Your API

Once your API is running, you can interact with it using curl or any HTTP client:

```bash
# List all users
curl "http://localhost:3000/users"

# Create a new user
curl "http://localhost:3000/users" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"name": "John Doe", "email": "john@example.com"}'

# Get a specific user
curl "http://localhost:3000/users/507f1f77bcf86cd799439011"

# Update a user
curl "http://localhost:3000/users/507f1f77bcf86cd799439011" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"name": "John Smith", "email": "john.smith@example.com"}'

# Delete a user
curl "http://localhost:3000/users/507f1f77bcf86cd799439011" -X DELETE
```

### Custom Operations

```javascript
import { API, Resource, Operation } from 'arrest';

class CustomOperation extends Operation {
  constructor(resource, path, method) {
    super(resource, path, method, 'customOp');
  }

  getDefaultInfo() {
    return {
      summary: 'Custom operation',
      description: 'Performs a custom operation',
      responses: {
        '200': {
          description: 'Success',
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        }
      }
    };
  }

  async handler(req, res, next) {
    try {
      const result = await this.runOperation({ req, res });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async runOperation(job) {
    return { message: 'Custom operation executed', timestamp: new Date() };
  }
}

const api = new API();
const resource = new Resource({ name: 'Custom' });

resource.addOperation(new CustomOperation(resource, '/action', 'post'));
api.addResource(resource);
```

## Core Concepts

arrest follows a three-tier architecture:

1. **API** - The top-level container that manages resources and generates OpenAPI specifications
2. **Resource** - A collection of related operations (e.g., User resource with CRUD operations)
3. **Operation** - Individual HTTP endpoints that handle specific requests

### Architecture Overview

```javascript
import { API, Resource, Operation } from 'arrest';

// 1. Create API instance
const api = new API({
  info: {
    title: 'My REST API',
    version: '1.0.0',
    description: 'A comprehensive REST API built with arrest'
  }
});

// 2. Create resource with operations
const userResource = new Resource({
  name: 'User',
  path: 'users' // Optional: defaults to plural of name
});

// 3. Add custom operations to resource
userResource.addOperation('/profile', 'get', async (req, res) => {
  res.json({ profile: 'user profile data' });
});

// 4. Add resource to API
api.addResource(userResource);

// 5. Start the server
api.listen(3000);
```

### Resource Naming and Paths

arrest automatically converts resource names to RESTful paths:

```javascript
// Resource name -> Path conversion
new Resource({ name: 'User' });        // -> /users
new Resource({ name: 'BlogPost' });    // -> /blog-posts  
new Resource({ name: 'UserProfile' }); // -> /user-profiles

// Custom path override
new Resource({ 
  name: 'User', 
  path: 'customers',           // Custom path
  namePlural: 'CustomerList'   // Custom plural name
});
```

## API Reference

### API Class

The main API container that manages resources and server configuration.

**Constructor Options:**
```javascript
new API({
  info: {
    title: 'API Title',
    version: '1.0.0',
    description: 'API Description'
  },
  servers: [
    { url: 'https://api.example.com', description: 'Production' },
    { url: 'http://localhost:3000', description: 'Development' }
  ],
  security: [
    { bearerAuth: [] }
  ]
})
```

**Key Methods:**
- `addResource(resource)` - Add a resource to the API
- `listen(port, callback?)` - Start HTTP server
- `listen({ http: 3000, https: 3443, options })` - Start HTTP/HTTPS servers
- `router()` - Get Express router for integration
- `attach(app, path?)` - Attach to existing Express app

### Resource Class

Represents a collection of related operations.

**Constructor Options:**
```javascript
new Resource({
  name: 'User',                    // Resource name (required)
  path: 'users',                   // Custom path (optional)
  namePlural: 'Users',             // Custom plural name (optional)
  description: 'User management'    // OpenAPI description (optional)
})
```

**Key Methods:**
- `addOperation(path, method, handler)` - Add simple operation
- `addOperation(operationInstance)` - Add operation instance

### MongoResource Class

Specialized resource for MongoDB collections with built-in CRUD operations.

**Constructor:**
```javascript
new MongoResource(connectionUri, options, customRoutes?)
```

**Options:**
```javascript
{
  name: 'User',                    // Resource name
  collection: 'users',            // MongoDB collection name
  id: '_id',                       // ID field name (default: '_id')
  idIsObjectId: true,              // Whether ID is ObjectId (default: true)
  queryLimit: 100,                 // Maximum query results (default: no limit)
  createIndexes: false,            // Auto-create indexes (default: false)
  escapeProperties: false          // Escape MongoDB special characters (default: false)
}
```

### Operation Class

Base class for individual API operations.

**Constructor:**
```javascript
new Operation(resource, path, method, operationId)
```

**Key Methods to Override:**
- `getDefaultInfo()` - Return OpenAPI operation info
- `handler(req, res, next)` - Express request handler
- `runOperation(job)` - Main operation logic

## Advanced Features

### JSON Schema Validation

arrest provides comprehensive input validation using OpenAPI v3.1 and JSON Schema Draft 2020-12:

```javascript
import { Operation } from 'arrest';

class CreateUserOperation extends Operation {
  constructor(resource, path, method) {
    super(resource, path, method, 'createUser');
  }

  getDefaultInfo() {
    return {
      summary: 'Create a new user',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email'],
              additionalProperties: false,
              properties: {
                name: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 100
                },
                email: {
                  type: 'string',
                  format: 'email'
                },
                age: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 150
                }
              }
            }
          }
        }
      },
      parameters: [
        {
          name: 'include',
          in: 'query',
          schema: {
            type: 'array',
            items: { type: 'string', enum: ['profile', 'preferences'] }
          },
          style: 'form',
          explode: false
        }
      ]
    };
  }

  async runOperation(job) {
    const { name, email, age } = job.req.body;
    const include = job.req.query.include || [];
    
    // Create user logic here
    return { id: '123', name, email, age, created: new Date() };
  }
}
```

### Resource Query Language (RQL)

arrest supports powerful querying with RQL syntax:

```javascript
// Examples of RQL queries
const queries = [
  // Basic filtering
  'eq(status,active)',
  'gt(age,18)',
  'in(category,electronics,books)',
  
  // Complex queries
  'and(eq(status,active),gt(price,100))',
  'or(eq(category,sale),lt(price,50))',
  
  // Sorting and pagination
  'sort(+name,-created)',
  'limit(10,20)', // limit(count, offset)
  
  // Field selection
  'select(name,email,created)'
];

// Use in API calls
// GET /users?q=and(eq(status,active),gt(age,18))&sort=-created&limit(10)
```

### Authentication and Authorization

#### OAuth2 Scopes

```javascript
import { API, MongoResource } from 'arrest';

class SecureAPI extends API {
  initSecurity(req, res, next) {
    // Extract and validate OAuth2 token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    // Validate token and set scopes
    req.scopes = ['read:users', 'write:users']; // From token validation
    next();
  }
}

class SecureOperation extends Operation {
  get swaggerScopes() {
    return {
      'oauth2': ['read:users', 'write:users']
    };
  }
}
```

#### CASL Ability-based Permissions

```javascript
import { defineAbility } from '@casl/ability';

class AuthorizedAPI extends API {
  initSecurity(req, res, next) {
    // Define user abilities based on their role
    req.ability = defineAbility((can, cannot) => {
      if (req.user.role === 'admin') {
        can('manage', 'all');
      } else if (req.user.role === 'user') {
        can('read', 'User', { ownerId: req.user.id });
        can('update', 'User', { ownerId: req.user.id });
        cannot('delete', 'User');
      }
    });
    next();
  }
}
```

### MongoDB Integration

#### Advanced MongoDB Operations

```javascript
import { MongoResource, QueryMongoOperation } from 'arrest';

class AdvancedUserResource extends MongoResource {
  constructor() {
    super('mongodb://localhost:27017/myapp', {
      name: 'User',
      collection: 'users',
      createIndexes: true
    });
  }

  getIndexes() {
    return [
      { key: { email: 1 }, unique: true },
      { key: { 'profile.tags': 1 } },
      { key: { createdAt: -1 } }
    ];
  }
}

// Custom aggregation operation
class UserStatsOperation extends QueryMongoOperation {
  async prepareQuery(job) {
    // Return MongoDB aggregation pipeline instead of simple query
    return [
      { $match: { status: 'active' } },
      { $group: {
          _id: '$department',
          count: { $sum: 1 },
          averageAge: { $avg: '$age' }
        }
      },
      { $sort: { count: -1 } }
    ];
  }
}
```

### CSV Export

Built-in CSV export functionality:

```javascript
// GET /users?format=csv&csv_fields=name,email,created
// GET /users?format=csv&csv_fields=name,email&csv_options=header=true&csv_names=Name,Email
```

### JSON-RPC Support

arrest supports dual REST and JSON-RPC interfaces:

```javascript
import { RPCOperation } from 'arrest';

class UserRPCOperation extends RPCOperation {
  async getUserProfile(params) {
    const { userId } = params;
    // Fetch user profile logic
    return { profile: { id: userId, name: 'John Doe' } };
  }

  async updateUserProfile(params) {
    const { userId, updates } = params;
    // Update logic
    return { success: true, updated: updates };
  }
}

// JSON-RPC calls:
// POST /users/rpc
// {"jsonrpc": "2.0", "method": "getUserProfile", "params": {"userId": "123"}, "id": 1}
```

### Pipeline Operations

Complex data processing with pipeline support:

```javascript
import { PipelineOperation } from 'arrest';

class DataProcessingPipeline extends PipelineOperation {
  async runOperation(job) {
    let data = await super.runOperation(job);
    
    // Apply transformations
    data = this.filterSensitiveData(data);
    data = this.calculateDerivedFields(data);
    data = this.formatForOutput(data, job.req.query.format);
    
    return data;
  }

  filterSensitiveData(data) {
    // Remove sensitive fields based on user permissions
    return data.map(item => this.filterFields(item, job.req.ability));
  }
}
```

### Express.js Integration

arrest works seamlessly with existing Express applications:

```javascript
import express from 'express';
import { API, MongoResource } from 'arrest';

const app = express();
const api = new API();

// Add resources to API
api.addResource(new MongoResource('mongodb://localhost:27017/mydb', {
  name: 'User'
}));

// Mount API on Express app
app.use('/api/v1', await api.router());

// Add other Express routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(3000);
```

### Error Handling

Comprehensive error handling with detailed responses:

```javascript
import { API } from 'arrest';

class CustomAPI extends API {
  handleError(error, req, res, next) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
        path: error.path
      });
    }
    
    if (error.code === 11000) { // MongoDB duplicate key
      return res.status(409).json({
        error: 'Resource already exists',
        field: Object.keys(error.keyPattern)[0]
      });
    }
    
    // Default error handling
    super.handleError(error, req, res, next);
  }
}
```

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import { API, MongoResource, Operation } from 'arrest';
import { Request, Response } from 'express';

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

class TypedUserOperation extends Operation {
  async runOperation(job: { req: Request; res: Response }): Promise<User> {
    const userData = job.req.body as Partial<User>;
    
    // Implementation with type safety
    return {
      id: 'generated-id',
      name: userData.name!,
      email: userData.email!,
      createdAt: new Date()
    };
  }
}
```

## Performance and Production

### Optimization Tips

1. **Use MongoDB indexes** - Define indexes for frequently queried fields
2. **Implement caching** - Use Redis or memory caching for frequently accessed data  
3. **Limit query results** - Set reasonable queryLimit on resources
4. **Use projections** - Only fetch needed fields with the `fields` parameter
5. **Enable compression** - Use gzip compression in production

### Production Configuration

```javascript
import { API, MongoResource } from 'arrest';

const api = new API({
  info: { title: 'Production API', version: '1.0.0' }
});

// Production MongoDB resource with optimization
api.addResource(new MongoResource('mongodb://mongo-cluster/prod-db', {
  name: 'User',
  collection: 'users',
  queryLimit: 100,        // Limit results
  createIndexes: true,    // Auto-create indexes
  escapeProperties: true  // Security: escape special chars
}));

// Start with both HTTP and HTTPS
api.listen({
  http: 8080,
  https: 8443,
  httpsOptions: {
    key: fs.readFileSync('private-key.pem'),
    cert: fs.readFileSync('certificate.pem')
  }
});
```

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please ensure all tests pass:

```bash
pnpm install
pnpm test
pnpm run coverage
```

## Related Projects

- [jsonref](https://github.com/vivocha/jsonref) - JSON Reference resolution
- [jsonpolice](https://github.com/vivocha/jsonpolice) - JSON Schema validation  
- [openapi-police](https://github.com/vivocha/openapi-police) - OpenAPI validation utilities

