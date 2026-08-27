/**
 * OpenAPI 3 document for Swagger UI.
 * Kept hand-written for precision — swagger-jsdoc annotations are optional add-ons.
 */
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AuraAI Backend API',
    version: '1.0.0',
    description:
      'AuraAI Makeup Intelligence API — auth, profile, SOCO makeup catalog, scan orchestration, and rule-based makeup recommendations. Product data sourced from review.soco.id/category/1/makeup. AI inference is delegated to a separate Python microservice.',
    contact: { name: 'AuraAI Engineering' },
  },
  servers: [{ url: '/', description: 'Current host' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          expiresIn: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
        },
      },
      ScanResponse: {
        type: 'object',
        properties: {
          analysis: {
            type: 'object',
            properties: {
              skinTone: { type: 'string', example: 'Light' },
              undertone: { type: 'string', example: 'Warm' },
              faceShape: { type: 'string', example: 'Oval' },
              confidence: { type: 'number', example: 0.91 },
            },
          },
          recommendation: {
            type: 'object',
            properties: {
              makeupTypes: { type: 'array', items: { type: 'object' } },
              products: {
                type: 'array',
                description: 'Top ranked products with matchScore + explanations + affiliateUrl',
                items: { type: 'object' },
              },
            },
          },
          scanId: { type: 'string', format: 'uuid' },
          recommendationId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Service health check',
        responses: {
          '200': { description: 'Health status' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Registered' },
          '409': { description: 'Email taken', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Tokens issued' } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'New tokens' } },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Always succeeds (anti-enumeration)' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password with token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Password updated' } },
      },
    },
    '/profile': {
      get: {
        tags: ['Profile'],
        summary: 'Get current profile',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Profile' } },
      },
      put: {
        tags: ['Profile'],
        summary: 'Update profile',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Updated profile' } },
      },
    },
    '/scan': {
      post: {
        tags: ['Scan'],
        summary: 'Upload selfie and run analysis pipeline',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['image'],
                properties: {
                  image: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Analysis + recommendations',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ScanResponse' },
              },
            },
          },
        },
      },
    },
    '/scan/history': {
      get: {
        tags: ['History'],
        summary: 'List scan history',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'History list' } },
      },
    },
    '/recommendation/latest': {
      get: {
        tags: ['Recommendation'],
        summary: 'Latest recommendation for the user',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Recommendation' } },
      },
    },
    '/products': {
      get: {
        tags: ['Makeup Catalog'],
        summary: 'List makeup products (SOCO-sourced)',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string', example: 'Lips' } },
          { name: 'subcategory', in: 'query', schema: { type: 'string', example: 'Lip Cream' } },
          { name: 'brand', in: 'query', schema: { type: 'string', example: 'Wardah' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } },
        ],
        responses: { '200': { description: 'Makeup catalog' } },
      },
    },
    '/products/categories': {
      get: {
        tags: ['Makeup Catalog'],
        summary: 'List makeup categories (Face, Lips, Eyes, …)',
        responses: { '200': { description: 'Categories' } },
      },
    },
    '/products/brands': {
      get: {
        tags: ['Makeup Catalog'],
        summary: 'List makeup brands',
        responses: { '200': { description: 'Brands' } },
      },
    },
    '/ingredients': {
      get: {
        tags: ['Makeup Catalog'],
        summary: 'Makeup type taxonomy (Foundation, Concealer, …)',
        responses: { '200': { description: 'Makeup types' } },
      },
    },
    '/users/me': {
      get: {
        tags: ['User'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'User' } },
      },
    },
  },
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'User' },
    { name: 'Profile' },
    { name: 'Scan' },
    { name: 'History' },
    { name: 'Recommendation' },
    { name: 'Makeup Catalog' },
  ],
} as const;
