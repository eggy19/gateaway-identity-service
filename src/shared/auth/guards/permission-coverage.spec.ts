import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  PERMISSION_EXEMPT_KEY,
  REQUIRE_PERMISSION_KEY,
} from '../decorators/require-permission.decorator';
import { IDENTITY_PERMISSIONS } from '../identity-permissions';

/**
 * AC-D1C-09 / BR-D1C-01: sweeps every controller under src/modules and fails when a handler
 * is neither exempt nor declares exactly the catalog permission (spec §7.5.2). A new
 * endpoint must be added to EXPECTED (and to the spec table), otherwise this test fails.
 */
const SRC = resolve(__dirname, '../../..');

/** Controllers exempt as a whole: caller's own `/auth/*` + `/sessions`, and the downstream proxy. */
const EXEMPT_CONTROLLERS = ['AuthController', 'SessionController', 'GatewayController'];

const EXPECTED = new Map<string, string>([
  ['GET tenants', 'identity.tenant.read'],
  ['GET tenants/:id', 'identity.tenant.read'],
  ['POST tenants', 'identity.tenant.create'],
  ['PUT tenants/:id', 'identity.tenant.update'],
  ['GET branches', 'identity.branch.read'],
  ['GET branches/:id', 'identity.branch.read'],
  ['POST branches', 'identity.branch.create'],
  ['PUT branches/:id', 'identity.branch.update'],
  ['GET users', 'identity.user.read'],
  ['GET users/:id', 'identity.user.read'],
  ['POST users', 'identity.user.create'],
  ['PUT users/:id', 'identity.user.update'],
  ['PATCH users/:id/status', 'identity.user.update'],
  ['POST users/:id/unlock', 'identity.user.unlock'],
  ['GET admin/sessions', 'identity.session.read'],
  ['DELETE admin/sessions/:id', 'identity.session.revoke'],
  ['GET admin/login-history', 'identity.login_history.read'],
]);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return controllerFiles(full);
    return name.endsWith('.controller.ts') ? [full] : [];
  });
}

interface Handler {
  readonly controller: string;
  readonly key: string;
  readonly fn: () => void;
}

interface ControllerClass {
  readonly name: string;
  readonly prototype: Record<string, unknown>;
}

function loadControllers(): { classes: ControllerClass[]; handlers: Handler[] } {
  const classes: ControllerClass[] = [];
  for (const file of controllerFiles(join(SRC, 'modules'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exp of Object.values(mod)) {
      if (typeof exp === 'function' && Reflect.hasMetadata(PATH_METADATA, exp)) {
        classes.push(exp);
      }
    }
  }
  const handlers: Handler[] = [];
  for (const cls of classes) {
    const base = String(Reflect.getMetadata(PATH_METADATA, cls));
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      const fn = cls.prototype[name] as () => void;
      if (typeof fn !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, fn)) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
      const sub = String(Reflect.getMetadata(PATH_METADATA, fn));
      const path = [base, sub]
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/^\/|\/$/g, '');
      handlers.push({ controller: cls.name, key: `${method} ${path}`, fn });
    }
  }
  return { classes, handlers };
}

describe('permission coverage of Gateway controllers (BR-D1C-01)', () => {
  const { classes, handlers } = loadControllers();
  const isPublic = (h: Handler) => Reflect.getMetadata(IS_PUBLIC_KEY, h.fn) === true;

  it('discovers the controllers (sanity)', () => {
    expect(classes.length).toBeGreaterThanOrEqual(9);
    expect(handlers.length).toBeGreaterThan(25);
  });

  it('only the own-session controllers and the proxy are class-exempt', () => {
    const exempt = classes
      .filter((cls) => Reflect.getMetadata(PERMISSION_EXEMPT_KEY, cls) === true)
      .map((cls) => cls.name)
      .sort();
    expect(exempt).toEqual([...EXEMPT_CONTROLLERS].sort());
  });

  it('declared permissions come from the identity.* catalog', () => {
    for (const permission of EXPECTED.values()) {
      expect(IDENTITY_PERMISSIONS as readonly string[]).toContain(permission);
    }
  });

  const guarded = handlers.filter(
    (h) => !EXEMPT_CONTROLLERS.includes(h.controller) && !isPublic(h),
  );

  it.each(guarded.map((h) => [h.controller, h.key, h] as const))(
    '%s %s declares exactly the catalog permission',
    (_controller, key, handler) => {
      const permission = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler.fn) as
        | string
        | undefined;
      expect(permission).toBeDefined();
      expect(EXPECTED.get(key)).toBe(permission);
    },
  );

  it('EXPECTED mapping has no stale entries', () => {
    const keys = new Set(guarded.map((h) => h.key));
    expect([...EXPECTED.keys()].filter((key) => !keys.has(key))).toEqual([]);
  });

  it('the only public handlers outside exempt controllers is GET /health', () => {
    const publics = handlers
      .filter((h) => !EXEMPT_CONTROLLERS.includes(h.controller) && isPublic(h))
      .map((h) => h.key);
    expect(publics).toEqual(['GET health']);
  });

  it('exempt controllers declare no identity permission', () => {
    for (const h of handlers.filter((x) => EXEMPT_CONTROLLERS.includes(x.controller))) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, h.fn)).toBeUndefined();
    }
  });
});
