import { Module } from '@nestjs/common';
import { CbtService } from './cbt.service';
import { CbtController } from './cbt.controller';

@Module({
  controllers: [CbtController],
  providers: [CbtService],
})
export class CbtModule {}
