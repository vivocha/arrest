# arrest

A powerful OpenAPI v3 compliant REST framework for Node.js with comprehensive MongoDB support, JSON Schema validation, authentication, and authorization. Build production-ready RESTful APIs in minutes with automatic OpenAPI documentation generation.

[![npm version](https://img.shields.io/npm/v/arrest.svg)](https://www.npmjs.com/package/arrest)
[![CI](https://github.com/vivocha/arrest/actions/workflows/ci.yml/badge.svg)](https://github.com/vivocha/arrest/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/vivocha/arrest/badge.svg?branch=master)](https://coveralls.io/github/vivocha/arrest?branch=master)

**[Documentation](https://github.com/vivocha/arrest#readme)** • **[API Reference](#api-reference)** • **[Examples](#quick-start)** • **[Contributing](#contributing)**

## Features

- ✅ **OpenAPI v3 Compliant**: Automatic OpenAPI specification generation with full v3 support
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

## Requirements

- **Node.js**: >= 18.17.0
- **MongoDB**: 6.x or higher (if using MongoResource)

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
  title: 'My API',
  version: '1.0.0'
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
  title: 'My REST API',
  version: '1.0.0',
  description: 'A comprehensive REST API built with arrest'
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
const api = new API({
  title: 'API Title',
  version: '1.0.0',
  description: 'API Description'
});

// Additional OpenAPI document properties can be set directly:
api.document.servers = [
  { url: 'https://api.example.com', description: 'Production' },
  { url: 'http://localhost:3000', description: 'Development' }
];
api.document.security = [
  { bearerAuth: [] }
];
```

**Key Methods:**
- `addResource(resource)` - Add a resource to the API
- `listen(httpPort, httpsPort?, httpsOptions?)` - Start HTTP and/or HTTPS server
- `router(options?)` - Get Express router for integration
- `attach(base, options?)` - Attach to existing Express app with automatic versioning

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

arrest provides comprehensive input validation using OpenAPI v3 and JSON Schema:

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

arrest supports powerful querying with Resource Query Language (RQL), allowing complex filtering, sorting, and pagination through URL parameters. RQL queries are converted to MongoDB queries automatically.

#### RQL Operators Reference

**Comparison Operators:**

| Operator | Description | Syntax | Example | MongoDB Equivalent |
|----------|-------------|--------|---------|-------------------|
| `eq` | Equal | `eq(field,value)` | `eq(status,active)` | `{status: "active"}` |
| `ne` | Not equal | `ne(field,value)` | `ne(status,inactive)` | `{status: {$ne: "inactive"}}` |
| `lt` | Less than | `lt(field,value)` | `lt(age,30)` | `{age: {$lt: 30}}` |
| `le` | Less than or equal | `le(field,value)` | `le(price,100)` | `{price: {$lte: 100}}` |
| `gt` | Greater than | `gt(field,value)` | `gt(age,18)` | `{age: {$gt: 18}}` |
| `ge` | Greater than or equal | `ge(field,value)` | `ge(score,90)` | `{score: {$gte: 90}}` |
| `in` | In array | `in(field,val1,val2,...)` | `in(category,books,electronics)` | `{category: {$in: ["books","electronics"]}}` |
| `out` | Not in array | `out(field,val1,val2,...)` | `out(status,draft,deleted)` | `{status: {$nin: ["draft","deleted"]}}` |
| `contains` | Contains value | `contains(field,value)` | `contains(tags,urgent)` | `{tags: "urgent"}` |
| `matches` | Regex match | `matches(field,pattern,flags?)` | `matches(email,.*@gmail.com,i)` | `{email: /.*@gmail.com/i}` |
| `text` | Full-text search | `text(searchTerm,language?)` | `text(javascript,en)` | `{$text: {$search: "javascript"}}` |

**Logical Operators:**

| Operator | Description | Syntax | Example |
|----------|-------------|--------|---------|
| `and` | Logical AND | `and(expr1,expr2,...)` | `and(eq(status,active),gt(age,18))` |
| `or` | Logical OR | `or(expr1,expr2,...)` | `or(eq(role,admin),eq(role,moderator))` |
| `not` | Logical NOT | `not(expr)` | `not(eq(deleted,true))` |

**Query Modifiers:**

| Operator | Description | Syntax | Example | Notes |
|----------|-------------|--------|---------|-------|
| `sort` | Sort results | `sort(field1,field2,...)` | `sort(+name,-createdAt)` | Prefix with `+` (asc) or `-` (desc) |
| `select` | Select fields | `select(field1,field2,...)` | `select(name,email,createdAt)` | Returns only specified fields |
| `limit` | Pagination | `limit(skip,count)` | `limit(0,10)` | Skip N records, return M records |

#### Practical Examples

**Basic Filtering:**
```bash
# Find active users
GET /users?q=eq(status,active)

# Find users older than 18
GET /users?q=gt(age,18)

# Find users with specific roles
GET /users?q=in(role,admin,moderator,editor)

# Find users NOT in certain departments
GET /users?q=out(department,sales,marketing)

# Find products with price less than or equal to 50
GET /products?q=le(price,50)
```

**Logical Combinations:**
```bash
# Active users older than 18
GET /users?q=and(eq(status,active),gt(age,18))

# Users who are admins OR moderators
GET /users?q=or(eq(role,admin),eq(role,moderator))

# Products on sale OR cheap products
GET /products?q=or(eq(onSale,true),lt(price,20))

# Active users in specific countries
GET /users?q=and(eq(status,active),in(country,US,UK,CA))

# Complex nested conditions
GET /products?q=and(eq(available,true),or(lt(price,50),eq(category,sale)))

# Not deleted items
GET /items?q=not(eq(deleted,true))
```

**Pattern Matching:**
```bash
# Find emails from Gmail (case-insensitive)
GET /users?q=matches(email,.*@gmail\.com,i)

# Find names starting with "John"
GET /users?q=matches(name,^John,i)

# Case-sensitive exact pattern
GET /products?q=matches(sku,^PROD-[0-9]{4}$)
```

**Full-Text Search:**
```bash
# Search in text-indexed fields
GET /articles?q=text(javascript tutorial)

# Search with specific language
GET /articles?q=text(programmazione,it)
```

**Array Fields:**
```bash
# Documents containing specific tag
GET /posts?q=contains(tags,javascript)

# Documents with any of multiple tags
GET /posts?q=contains(tags,javascript,typescript,node)
```

**Sorting:**
```bash
# Sort by name ascending
GET /users?q=sort(+name)

# Sort by creation date descending
GET /users?q=sort(-createdAt)

# Multiple sort fields: name ascending, then age descending
GET /users?q=sort(+name,-age)

# Combine with filtering
GET /users?q=and(eq(status,active),sort(-createdAt))
```

**Field Selection (Projection):**
```bash
# Return only name and email
GET /users?q=select(name,email)

# Return specific fields from filtered results
GET /users?q=and(eq(status,active),select(name,email,role))
```

**Pagination:**
```bash
# Get first 10 users
GET /users?q=limit(0,10)

# Get next 10 users (skip 10, return 10)
GET /users?q=limit(10,10)

# Page 3 with 20 items per page (skip 40, return 20)
GET /users?q=limit(40,20)

# Combine with sorting and filtering
GET /users?q=and(eq(status,active),sort(-createdAt),limit(0,20))
```

#### Complete Real-World Examples

```bash
# E-commerce: Active products under $100, sorted by price
GET /products?q=and(eq(status,active),lt(price,100),sort(+price))

# Users: Active admins or moderators, sorted by name
GET /users?q=and(eq(status,active),or(eq(role,admin),eq(role,moderator)),sort(+name))

# Blog: Published posts with specific tags, paginated
GET /posts?q=and(eq(published,true),in(category,tech,programming),sort(-publishedAt),limit(0,10))

# Search: Full-text search with filters and field selection
GET /articles?q=and(text(mongodb tutorial),ge(rating,4),select(title,author,publishedAt))

# Complex: Multiple conditions with nested OR
GET /orders?q=and(in(status,pending,processing),or(gt(total,100),eq(priority,high)),sort(-createdAt),limit(0,50))
```

#### URL Encoding

When using RQL in URLs, special characters must be properly encoded:

```javascript
// JavaScript example: encoding RQL queries
const query = 'and(eq(status,active),gt(age,18))';
const encodedQuery = encodeURIComponent(query);
// Result: and%28eq%28status%2Cactive%29%2Cgt%28age%2C18%29%29

// Using fetch
fetch(`/api/users?q=${encodeURIComponent('eq(status,active)')}`);

// Using axios
axios.get('/api/users', {
  params: {
    q: 'eq(status,active)'  // axios handles encoding automatically
  }
});
```

**Common encoding requirements:**
- Parentheses: `(` → `%28`, `)` → `%29`
- Commas: `,` → `%2C`
- Spaces: ` ` → `%20` or `+`
- Equals: `=` → `%3D` (in values, not query params)
- Ampersands: `&` → `%26` (in RQL expressions)

```bash
# Before encoding
GET /users?q=and(eq(status,active),matches(name,John.*))

# After encoding (what actually gets sent)
GET /users?q=and%28eq%28status%2Cactive%29%2Cmatches%28name%2CJohn.*%29%29
```

#### Best Practices and Tips

1. **Use appropriate operators**: Choose the most specific operator for your needs
   - Use `in` instead of multiple `or(eq(...))` expressions
   - Use `ge`/`le` for inclusive ranges, `gt`/`lt` for exclusive

2. **Optimize complex queries**:
   - Put most selective filters first in `and()` expressions
   - Use indexes on frequently queried fields
   - Consider using `select()` to reduce payload size

3. **Text search requires indexes**:
   ```javascript
   // Define text index in your MongoResource
   getIndexes() {
     return [
       { key: { title: 'text', description: 'text' } }
     ];
   }
   ```

4. **ObjectId handling**:
   - RQL automatically converts string IDs to MongoDB ObjectId for `_id` field
   - Example: `eq(_id,507f1f77bcf86cd799439011)` works automatically

5. **Regex performance**:
   - Avoid leading wildcards when possible: `^John` is faster than `.*John`
   - Use case-insensitive flag sparingly
   - Consider full-text search for complex text queries

6. **Combining operators**:
   ```bash
   # Good: Logical structure
   GET /items?q=and(eq(active,true),or(lt(price,50),eq(sale,true)),sort(-date),limit(0,20))

   # Avoid: Overly complex nesting - split into multiple requests if needed
   ```

7. **Default query limits**:
   - Consider setting `queryLimit` in MongoResource options to prevent excessive results
   - Always use `limit()` for paginated interfaces

8. **Testing RQL queries**:
   ```bash
   # Use curl for testing
   curl "http://localhost:3000/users?q=$(node -p 'encodeURIComponent("eq(status,active)")')"

   # Or use a tool that handles encoding
   http GET "localhost:3000/users" q=="eq(status,active)"  # HTTPie
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
  title: 'Production API',
  version: '1.0.0'
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
api.listen(8080, 8443, {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
});
```

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Development

This project uses **pnpm** as the package manager and **TypeScript** for development.

### Available Scripts

```bash
# Install dependencies
pnpm install

# Build the project (compile TypeScript)
pnpm run build

# Run tests (builds and compiles tests first)
pnpm run test

# Run tests with coverage
pnpm run cover

# Check that coverage meets 100% requirement
pnpm run check-coverage

# Clean build artifacts
pnpm run clean

# Watch mode for tests
pnpm run test:watch
```

### Build Output

- **Source**: `src/` (TypeScript)
- **Compiled**: `dist/` (JavaScript + type definitions)
- **Tests**: `test/ts/` (TypeScript) → `test/` (compiled JavaScript)

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository** on [GitHub](https://github.com/vivocha/arrest)
2. **Create a feature branch** (`git checkout -b feature/my-feature`)
3. **Write tests** for your changes
4. **Ensure 100% test coverage** is maintained
5. **Run the test suite** and verify all tests pass:

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run check-coverage  # Must show 100% coverage
```

6. **Commit your changes** using conventional commits
7. **Push to your fork** and submit a pull request

### Testing Requirements

- All code must have **100% test coverage** (statements, branches, functions, lines)
- Tests use **mocha** as the test framework
- MongoDB integration tests use **mongodoki** for test database setup
- Tests are written in TypeScript and compiled before running

## Related Projects

- [jsonref](https://github.com/vivocha/jsonref) - JSON Reference resolution
- [jsonpolice](https://github.com/vivocha/jsonpolice) - JSON Schema validation  
- [openapi-police](https://github.com/vivocha/openapi-police) - OpenAPI validation utilities

