# arrest - Claude Development Guide

## Project Overview
OpenAPI v3 compliant REST framework for Node.js with support for MongoDB and JSON-Schema. Comprehensive REST API framework with authentication, authorization, and data validation.

## Key Commands
- **build**: `pnpm run build` - Compiles TypeScript to JavaScript
- **test**: `pnpm run test` - Runs tests with full build and TypeScript compilation
- **coverage**: `pnpm run cover` - Runs tests with coverage reporting
- **check-coverage**: `pnpm run check-coverage` - Verifies 100% coverage requirement
- **clean**: `pnpm run clean` - Removes build artifacts and compiled test files

## Project Structure
- `src/` - TypeScript source files
- `dist/` - Built JavaScript files
- `test/ts/` - TypeScript test files
- `test/` - Compiled JavaScript test files

## Key Dependencies
- **express**: ^4.19.2 - Web framework
- **mongodb**: ^6.8.0 - MongoDB driver
- **jsonref**: ^9.0.0 - JSON reference resolution
- **openapi-police**: ^0.0.0-development - OpenAPI validation
- **@casl/ability**: ^6.7.1 - Authorization framework
- **luxon**: ^3.4.4 - Date/time handling

## Build Configuration
- **TypeScript**: 5.5.2 with NodeNext modules targeting ES2022
- **Node.js**: >=18.17.0
- **Coverage**: 100% required (statements, branches, functions, lines)
- **Module**: ESM with .js exports

## Development Notes
- Uses pnpm as package manager
- Tests are written in TypeScript and compiled before running
- Requires MongoDB for testing (uses mongodoki for test setup)
- All code must maintain 100% test coverage
- Includes semantic-release for automated versioning
- Source maps enabled for debugging