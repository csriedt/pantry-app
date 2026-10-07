// Barrel for the Drizzle schema. Layer files (catalog, pantry, recipes, …)
// export their tables from here; drizzle-kit reads this file as the schema
// entry point (see drizzle.config.ts).
export * from "./catalog";
