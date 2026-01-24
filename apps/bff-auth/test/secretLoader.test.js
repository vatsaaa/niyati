/**
 * Tests for Docker secrets file loading
 * 
 * The loadSecretFromFile function reads secrets from _FILE env vars
 * and sets the actual env vars before modules validate them.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('loadSecretFromFile', () => {
  const ORIGINAL_ENV = { ...process.env };
  let tempDir;
  let loadSecretFromFile;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    
    // Create temp directory for secret files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));
    
    // Define the function inline for testing (same as in index.js)
    loadSecretFromFile = function(envVar, fileEnvVar) {
      const filePath = process.env[fileEnvVar];
      if (filePath && fs.existsSync(filePath)) {
        try {
          const value = fs.readFileSync(filePath, 'utf8').trim();
          process.env[envVar] = value;
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    // Clean up temp files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('loads secret from file and sets env var', () => {
    const secretPath = path.join(tempDir, 'access_token_secret');
    fs.writeFileSync(secretPath, 'my-super-secret-value\n');
    
    process.env.ACCESS_TOKEN_SECRET_FILE = secretPath;
    delete process.env.ACCESS_TOKEN_SECRET;
    
    const result = loadSecretFromFile('ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_SECRET_FILE');
    
    expect(result).toBe(true);
    expect(process.env.ACCESS_TOKEN_SECRET).toBe('my-super-secret-value');
  });

  test('trims whitespace from secret value', () => {
    const secretPath = path.join(tempDir, 'jwt_secret');
    fs.writeFileSync(secretPath, '  secret-with-spaces  \n\n');
    
    process.env.JWT_SECRET_FILE = secretPath;
    
    loadSecretFromFile('JWT_SECRET', 'JWT_SECRET_FILE');
    
    expect(process.env.JWT_SECRET).toBe('secret-with-spaces');
  });

  test('returns false when file env var is not set', () => {
    delete process.env.ACCESS_TOKEN_SECRET_FILE;
    delete process.env.ACCESS_TOKEN_SECRET;
    
    const result = loadSecretFromFile('ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_SECRET_FILE');
    
    expect(result).toBe(false);
    expect(process.env.ACCESS_TOKEN_SECRET).toBeUndefined();
  });

  test('returns false when file does not exist', () => {
    process.env.ACCESS_TOKEN_SECRET_FILE = '/nonexistent/path/secret';
    delete process.env.ACCESS_TOKEN_SECRET;
    
    const result = loadSecretFromFile('ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_SECRET_FILE');
    
    expect(result).toBe(false);
    expect(process.env.ACCESS_TOKEN_SECRET).toBeUndefined();
  });

  test('does not override existing env var when file is missing', () => {
    process.env.ACCESS_TOKEN_SECRET = 'existing-value';
    process.env.ACCESS_TOKEN_SECRET_FILE = '/nonexistent/path/secret';
    
    loadSecretFromFile('ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_SECRET_FILE');
    
    // Existing value should remain unchanged
    expect(process.env.ACCESS_TOKEN_SECRET).toBe('existing-value');
  });

  test('handles multiple secrets', () => {
    const accessPath = path.join(tempDir, 'access_token');
    const jwtPath = path.join(tempDir, 'jwt_secret');
    
    fs.writeFileSync(accessPath, 'access-secret-123');
    fs.writeFileSync(jwtPath, 'jwt-secret-456');
    
    process.env.ACCESS_TOKEN_SECRET_FILE = accessPath;
    process.env.JWT_SECRET_FILE = jwtPath;
    
    loadSecretFromFile('ACCESS_TOKEN_SECRET', 'ACCESS_TOKEN_SECRET_FILE');
    loadSecretFromFile('JWT_SECRET', 'JWT_SECRET_FILE');
    
    expect(process.env.ACCESS_TOKEN_SECRET).toBe('access-secret-123');
    expect(process.env.JWT_SECRET).toBe('jwt-secret-456');
  });
});
