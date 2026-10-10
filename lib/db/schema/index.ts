// Barrel for the Drizzle schema. Layer files (catalog, pantry, recipes, …)
// export their tables from here; drizzle-kit reads this file as the schema
// entry point (see drizzle.config.ts).
export * from "./catalog";
export * from "./pantry";
export * from "./recipes";
export * from "./meals";
export * from "./trends";
export * from "./ai";
export * from "./lifecycle";
