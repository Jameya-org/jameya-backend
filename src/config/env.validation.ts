export function validateEnv(config: Record<string, unknown>) {
  const required = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  for (const key of required) {
    if (!config[key] && !process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return config;
}
