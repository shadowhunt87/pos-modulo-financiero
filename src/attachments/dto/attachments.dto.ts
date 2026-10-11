import { IsOptional, IsUUID } from 'class-validator';

/** Exactamente UNO de estos campos identifica el documento al que pertenece el archivo (lo valida el service). */
export class AttachmentParentDto {
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() paymentId?: string;
  @IsOptional() @IsUUID() journalEntryId?: string;
  @IsOptional() @IsUUID() reconciliationId?: string;
}

export class UploadAttachmentDto extends AttachmentParentDto {}
export class ListAttachmentsQuery extends AttachmentParentDto {}
