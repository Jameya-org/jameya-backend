# Jameya Backend API 🚀

RESTful Backend API for **Jameya (Rotating Savings & Credit Association)** built with NestJS, Prisma, and PostgreSQL.

---

## 📄 API Documentation (For Frontend Developers)

Interactive Swagger API Documentation is automatically served when the application is running.

- **Live / Render Swagger UI:** [https://jameya-backend.onrender.com/api-docs](https://jameya-backend.onrender.com/api-docs)
- **Local Swagger UI:** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

> 💡 **Frontend Team Note:**
> All available API endpoints (Auth, Customer Management, Circle Management, Admin, etc.), request payloads, responses, and authentication requirements (JWT Bearer tokens) can be inspected and tested directly through the Swagger interface.

---

## 🛠️ Prerequisites

- **Node.js** (v20+ recommended)
- **Docker & Docker Compose**

---

## 🚀 Getting Started

### 1. Environment Setup

Copy `.env.example` to create your local `.env` file:

```bash
cp .env.example .env
```

### 2. Start PostgreSQL & Services (Docker)

Spin up the local PostgreSQL database (exposed on port `5422`) and Adminer interface:

```bash
docker compose up -d
```

- **PostgreSQL**: `localhost:5422`
- **Adminer (DB Web UI)**: [http://localhost:8080](http://localhost:8080)

### 3. Install Dependencies

```bash
npm install
```

### 4. Database Migrations & Seeding

Apply database schema migrations and seed initial default data (Super Admin account & roles):

```bash
# Generate Prisma Client
npx prisma generate

# Apply DB Migrations
npx prisma migrate dev

# Seed Database
npx prisma db seed
```

---

## 🏃 Running the Application

```bash
# Development (with hot-reload)
npm run start:dev

# Production build & run
npm run build
npm run start:prod
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:cov
```
