# Auth System with RBAC on GCP

[![CI Pipeline](https://github.com/yourusername/auth-rbac-system/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/auth-rbac-system/actions/workflows/ci.yml)
[![CD Pipeline](https://github.com/yourusername/auth-rbac-system/actions/workflows/cd.yml/badge.svg)](https://github.com/yourusername/auth-rbac-system/actions/workflows/cd.yml)

A scalable, secure authentication and role-based access control (RBAC) system built on Google Cloud Platform (GCP) with Firebase, Cloud Run, and Firestore.

## Features

- **Firebase Authentication Integration**: Secure user authentication with multiple sign-in methods
- **Role-Based Access Control (RBAC)**: Flexible permission system with customizable roles
- **Scalable Architecture**: Built on Google Cloud Platform's serverless infrastructure
- **Real-time Database**: Powered by Firestore for real-time updates and high availability
- **Comprehensive Testing**: Unit and integration tests with high code coverage
- **CI/CD Pipeline**: Automated build, test, and deployment via GitHub Actions
- **Infrastructure as Code**: GCP resources managed with Terraform

## Tech Stack

- **Backend**: Node.js 22 with TypeScript
- **Authentication**: Firebase Authentication
- **Database**: Firestore
- **Deployment**: Cloud Run
- **CI/CD**: GitHub Actions
- **IaC**: Terraform
- **Testing**: Jest + Supertest

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- Google Cloud SDK
- Terraform
- Docker (optional, for local container testing)

## Getting Started

### Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/solvejet/cloud_function.git
   cd auth-rbac-system
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up Firebase:

   - Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/)
   - Enable Firebase Authentication
   - Create a service account key and save it as `service-account.json` in the project root

4. Run the development server:

   ```bash
   npm run dev
   ```

5. Run tests:
   ```bash
   npm test
   ```

### Environment Variables

Create a `.env` file in the project root with the following variables:

```
NODE_ENV=development
PORT=8080
PROJECT_ID=your-gcp-project-id
```

For production, these variables should be set in your deployment environment.

## API Documentation

### Authentication Endpoints

| Method | Endpoint             | Description       | Auth Required | Permissions Required |
| ------ | -------------------- | ----------------- | ------------- | -------------------- |
| POST   | /api/users           | Create a new user | Yes           | users:create         |
| GET    | /api/users/:id       | Get user details  | Yes           | users:read or self   |
| PUT    | /api/users/:id/roles | Update user roles | Yes           | users:update         |

### RBAC Endpoints

| Method | Endpoint              | Description             | Auth Required | Permissions Required |
| ------ | --------------------- | ----------------------- | ------------- | -------------------- |
| POST   | /api/rbac/roles       | Create a new role       | Yes           | roles:create         |
| GET    | /api/rbac/roles       | Get all roles           | Yes           | roles:read           |
| POST   | /api/rbac/permissions | Create a new permission | Yes           | permissions:create   |

## Deployment

See the [Comprehensive Deployment Guide](docs/deployment-guide.md) for detailed instructions on deploying to GCP.

Basic deployment steps:

1. Set up GCP and Firebase projects
2. Initialize infrastructure with Terraform
3. Set up GitHub Secrets for CI/CD
4. Push to main branch to trigger deployment

## Project Structure

```
cloud_function/
├── .github/                  # GitHub Actions workflows
├── src/
│   ├── config/               # Application configuration
│   ├── controllers/          # API controllers
│   ├── middleware/           # Express middleware
│   │   ├── auth.ts           # Authentication middleware
│   │   └── validation/       # Request validation
│   ├── models/               # Data models
│   ├── routes/               # API routes
│   ├── tests/                # Tests
│   │   ├── unit/             # Unit tests
│   │   └── integration/      # Integration tests
│   ├── types/                # TypeScript type definitions
│   ├── utils/                # Utility functions
│   └── index.ts              # Application entry point
├── terraform/                # Infrastructure as Code
├── scripts/                  # Utility scripts
├── .env.example              # Example environment variables
├── Dockerfile                # Container definition
├── jest.config.js            # Test configuration
├── package.json              # Project metadata
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## Security

This system implements best practices for security:

- JWT token-based authentication
- Role-based access control (RBAC)
- Input validation and sanitization
- Firestore security rules
- HTTPS-only communication

## License

[MIT License](LICENSE)

## Acknowledgements

- [Firebase](https://firebase.google.com/)
- [Google Cloud Platform](https://cloud.google.com/)
- [Express.js](https://expressjs.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Terraform](https://www.terraform.io/)
