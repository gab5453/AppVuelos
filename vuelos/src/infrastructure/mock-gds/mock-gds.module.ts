import { Global, Module } from '@nestjs/common';
import { MockGdsService } from './mock-gds.service.js';

/**
 * Sistema externo simulado (GDS). Es global para que todos los adaptadores mock compartan una
 * única instancia de inventario y asientos, como ocurriría con el GDS real.
 * Solo los adaptadores de `infrastructure/` lo usan; los dominios dependen de sus propios ports.
 */
@Global()
@Module({
  providers: [MockGdsService],
  exports: [MockGdsService],
})
export class MockGdsModule {}
