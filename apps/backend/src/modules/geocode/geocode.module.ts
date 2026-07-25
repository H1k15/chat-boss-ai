import { Module } from '@nestjs/common';
import { GeocodeService } from './geocode.service';
import { GeocodeController } from './geocode.controller';

// Geocode qua OpenStreetMap Nominatim (không Google Maps). PrismaService là
// global nên không cần import lại. GeocodeService export cho RoomMatcher dùng.
@Module({
  controllers: [GeocodeController],
  providers: [GeocodeService],
  exports: [GeocodeService],
})
export class GeocodeModule {}
