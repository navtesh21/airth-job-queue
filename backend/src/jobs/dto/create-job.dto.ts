import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateJobDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  // `status`, `id` and `createdAt` are deliberately absent: the server owns them.
  // With `forbidNonWhitelisted`, a client sending e.g. { status: "completed" } gets a 400.
}
