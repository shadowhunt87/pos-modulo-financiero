import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

// No se permite cambiar `code` ni `type`: los asientos ya posteados dependen de ellos.
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // null = quitar el padre (volverla cuenta raíz)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
