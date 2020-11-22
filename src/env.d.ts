declare namespace NodeJS {
  export interface ProcessEnv {
    DATABASE_URL: string;
    REDIS_HOST: string;
    REDIS_PORT: number;
    PORT: number;
    SESSION_SECRET: string;
    CORS_ORIGIN: string;
  }
}
