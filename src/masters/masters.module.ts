import { Module } from '@nestjs/common';
import { PartnersController } from './partners/partners.controller.js';
import { PartnersService } from './partners/partners.service.js';
import { TaxRatesController } from './tax-rates/tax-rates.controller.js';
import { TaxRatesService } from './tax-rates/tax-rates.service.js';
import { NcfController } from './ncf/ncf.controller.js';
import { NcfService } from './ncf/ncf.service.js';
import { AccountingSettingsController } from './accounting-settings/accounting-settings.controller.js';
import { AccountingSettingsService } from './accounting-settings/accounting-settings.service.js';
import { JournalsController } from './journals/journals.controller.js';
import { JournalsService } from './journals/journals.service.js';
import { DocumentSequencesController } from './sequences/document-sequences.controller.js';
import { DocumentSequencesService } from './sequences/document-sequences.service.js';
import { AccountClassificationController } from './account-classification/account-classification.controller.js';
import { AccountClassificationService } from './account-classification/account-classification.service.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsService } from './products/products.service.js';

// PrismaModule es @Global. Facturación, pagos y tesorería importarán este módulo
// para consumir NCF, numeración, diarios y cuentas por defecto.
@Module({
  controllers: [
    PartnersController, TaxRatesController, NcfController,
    AccountingSettingsController, JournalsController, DocumentSequencesController, AccountClassificationController,
    ProductsController,
  ],
  providers: [
    PartnersService, TaxRatesService, NcfService,
    AccountingSettingsService, JournalsService, DocumentSequencesService, AccountClassificationService,
    ProductsService,
  ],
  exports: [NcfService, AccountingSettingsService, JournalsService, DocumentSequencesService, PartnersService],
})
export class MastersModule {}