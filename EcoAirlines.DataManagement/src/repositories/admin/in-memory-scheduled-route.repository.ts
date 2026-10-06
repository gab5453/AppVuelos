import { Injectable } from '@nestjs/common';
import { AdminDataContext } from '@ecoairlines/data-access/context/admin.context.js';
import type { ScheduledRouteRecord } from '@ecoairlines/data-access/entities/admin/scheduled-route.entity.js';
import type { ScheduledRouteRepository } from '../../interfaces/admin/scheduled-route.repository.js';

/** Rutas programadas en memoria, en el orden en que se crearon (el GDS asigna los aviones en ese orden). */
@Injectable()
export class InMemoryScheduledRouteRepository implements ScheduledRouteRepository {
  constructor(private readonly db: AdminDataContext) {}

  async findAll(): Promise<ScheduledRouteRecord[]> {
    return [...this.db.routes.values()];
  }

  async findById(routeId: string): Promise<ScheduledRouteRecord | undefined> {
    return this.db.routes.get(routeId);
  }

  async save(route: ScheduledRouteRecord): Promise<ScheduledRouteRecord> {
    this.db.routes.set(route.routeId, route);
    return route;
  }

  async delete(routeId: string): Promise<void> {
    this.db.routes.delete(routeId);
  }
}
