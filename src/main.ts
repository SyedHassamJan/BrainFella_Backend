import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

async function bootstrap() {
  // Body parsers are registered by hand so that only the endpoints carrying
  // base64 media get a large limit (Express's default is 100 kB); everything
  // else keeps a small one. The route-specific parser must come first.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use('/screening/analyze-voice', json({ limit: '15mb' }));
  app.use(json());
  app.use(urlencoded({ extended: true }));

  // Enable CORS for frontend communication
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // FIX 10 — Global exception filter: returns clean JSON for ALL errors
  // Must be registered BEFORE ValidationPipe
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Apply global validation pipe — whitelist strips unknown fields
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configure Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('BrainHealth API')
    .setDescription('The BrainHealth backend API documentation')
    .setVersion('1.0')
    .addBearerAuth() // Adds the JWT token input box to the Swagger UI
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(8001);
  console.log(`🚀 BrainHealth API running on http://localhost:8001`);
}
bootstrap();
