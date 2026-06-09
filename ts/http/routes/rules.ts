import { Hono } from "hono";
import { RuleRepository } from "../../rules/repository";
import { RuleService } from "../../rules/service";
import { ruleInputSchema, compileRuleInput } from "../../rules/schema";
import { SOURCE_DEFINITIONS, HOURLY_TIMESLOTS } from "../../shared/sources";
import { FACILITY_CATALOG } from "../../rules/catalog";
import type { AuthVariables } from "../middleware/session";

export const rulesRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

  // GET /api/rules
  .get("/rules", async (c) => {
    const service = new RuleService(new RuleRepository(c.env.APP_DB), c.env.APP_DB);
    const rules = await service.listByUser(c.get("access").userId);
    return c.json(rules);
  })

  // POST /api/rules
  .post("/rules", async (c) => {
    const body = await c.req.json();
    const parsed = ruleInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "validation_error", details: parsed.error.flatten() }, 400);
    }
    const compiled = compileRuleInput(parsed.data);
    const service = new RuleService(new RuleRepository(c.env.APP_DB), c.env.APP_DB);
    try {
      const rule = await service.create(c.get("access").userId, compiled);
      return c.json(rule, 201);
    } catch (err: any) {
      if (err.code === "rule_limit_reached") return c.json({ error: "rule_limit_reached" }, 409);
      if (err.code === "inactive_access") return c.json({ error: "inactive_access" }, 403);
      throw err;
    }
  })

  // GET /api/rules/:id
  .get("/rules/:id", async (c) => {
    const service = new RuleService(new RuleRepository(c.env.APP_DB), c.env.APP_DB);
    const rule = await service.getById(c.get("access").userId, c.req.param("id"));
    if (!rule) return c.json({ error: "rule_not_found" }, 404);
    return c.json(rule);
  })

  // PATCH /api/rules/:id
  .patch("/rules/:id", async (c) => {
    const body = await c.req.json();
    const service = new RuleService(new RuleRepository(c.env.APP_DB), c.env.APP_DB);
    try {
      const rule = await service.update(c.get("access").userId, c.req.param("id"), body);
      return c.json(rule);
    } catch (err: any) {
      if (err.code === "rule_not_found") return c.json({ error: "rule_not_found" }, 404);
      throw err;
    }
  })

  // DELETE /api/rules/:id
  .delete("/rules/:id", async (c) => {
    const service = new RuleService(new RuleRepository(c.env.APP_DB), c.env.APP_DB);
    try {
      await service.delete(c.get("access").userId, c.req.param("id"));
      return c.body(null, 204);
    } catch (err: any) {
      if (err.code === "rule_not_found") return c.json({ error: "rule_not_found" }, 404);
      throw err;
    }
  })

  // GET /api/rule-options
  .get("/rule-options", (c) => {
    return c.json({
      sources: Object.values(SOURCE_DEFINITIONS),
      facilities: FACILITY_CATALOG,
      weekdays: [
        { value: 1, label: "周一" }, { value: 2, label: "周二" },
        { value: 3, label: "周三" }, { value: 4, label: "周四" },
        { value: 5, label: "周五" }, { value: 6, label: "周六" },
        { value: 7, label: "周日" },
      ],
      timeslots: HOURLY_TIMESLOTS,
      pushLimitOptions: [
        { value: -1, label: "不限制" },
        { value: 0, label: "关闭" },
        { value: 1, label: "1 次" },
        { value: 3, label: "3 次" },
      ],
    });
  });
