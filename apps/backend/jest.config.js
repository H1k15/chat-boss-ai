module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // isolatedModules: ts-jest CHỈ transpile, KHÔNG typecheck lại mỗi file. Việc
  // typecheck đã do `pnpm typecheck` (tsc --noEmit) lo riêng, nên bỏ ở đây giúp:
  //  - test nhanh hẳn (~196s -> ~20s vì không dựng TS Program mỗi suite)
  //  - hết cảnh báo "worker failed to exit gracefully" (do TS language service
  //    của ts-jest còn treo trong jest worker lúc teardown).
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  moduleNameMapper: {
    '^@cba/shared$': '<rootDir>/../../../packages/shared/src',
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
  testEnvironment: 'node',
};
