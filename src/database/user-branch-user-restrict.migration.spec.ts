import { QueryRunner } from 'typeorm';
import { UserBranchUserRestrict1750000000004 } from './migrations/1750000000004-UserBranchUserRestrict';

describe('UserBranchUserRestrict migration (KP-35)', () => {
  const run = async (method: 'up' | 'down'): Promise<string[]> => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;
    await new UserBranchUserRestrict1750000000004()[method](queryRunner);
    return queries;
  };

  it('up swaps fk_user_branch_user to ON DELETE RESTRICT', async () => {
    expect(await run('up')).toEqual([
      'alter table "user_branch" drop constraint "fk_user_branch_user"',
      'alter table "user_branch" add constraint "fk_user_branch_user" foreign key ("user_id") references "user" ("id") on delete restrict',
    ]);
  });

  it('down restores ON DELETE CASCADE', async () => {
    expect(await run('down')).toEqual([
      'alter table "user_branch" drop constraint "fk_user_branch_user"',
      'alter table "user_branch" add constraint "fk_user_branch_user" foreign key ("user_id") references "user" ("id") on delete cascade',
    ]);
  });
});
