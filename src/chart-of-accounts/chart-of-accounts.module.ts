import { Module } from '@nestjs/common';
import { AccountClassificationService } from '../masters/account-classification/account-classification.service.js';
import { ChartOfAccountsController } from './chart-of-accounts.controller.js';
import { ChartOfAccountsService } from './chart-of-accounts.service.js';

// PrismaModule es @Global. AccountClassificationService solo depende de Prisma y no tiene estado:
// se provee aquí para no tener que exportarlo desde MastersModule (archivo del socio).
@Module({
  controllers: [ChartOfAccountsController],
  providers: [ChartOfAccountsService, AccountClassificationService],
})
export class ChartOfAccountsModule {}
