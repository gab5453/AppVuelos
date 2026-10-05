import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module.js';
import { CheckInController } from './presentation/check-in.controller.js';
import { CheckInService } from './application/check-in.service.js';

@Module({
  imports: [BookingsModule],
  controllers: [CheckInController],
  providers: [CheckInService],
})
export class CheckInModule {}
