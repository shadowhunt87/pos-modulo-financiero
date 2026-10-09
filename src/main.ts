import { ConfigService } from '@nestjs/config';
import { createApp } from './app.setup.js';

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  await app.listen(config.get<number>('PORT') ?? 3000);
}
void bootstrap();
