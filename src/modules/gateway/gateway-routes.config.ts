export interface GatewayRoute {
  audience: string;
}

/** Maps URL prefix → downstream JWT audience + service key in GatewayConfig.services. */
export const GATEWAY_ROUTES: Record<string, GatewayRoute> = {
  inventory: { audience: 'inventory-service' },
  billing: { audience: 'billing-service' },
  clinical: { audience: 'clinical-service' },
  notification: { audience: 'notification-service' },
};
