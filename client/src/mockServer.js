import { createServer, Model, Response } from "miragejs";

export function makeServer({ environment = "development" } = {}) {
  let server = createServer({
    environment,

    models: {
      user: Model,
      record: Model,
      execution: Model,
      cnss: Model,
      event: Model,
      contact: Model,
    },

    seeds(server) {
      server.create("user", { id: 1, username: "demo", role: "superadmin", id_so: "demo_so" });

      // Create some General Records
      for (let i = 1; i <= 15; i++) {
        server.create("record", {
          id_r: i,
          ref: 1000 + i,
          de_part: `طالب ${i}`,
          nom_cl1: `الخصم ${i}`,
          date_reg: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
          status: i % 3 === 0 ? 'completed' : 'in_progress',
          salaire: (150 + i * 10),
          tva: 19,
          remarque: "ملف تجريبي للمراجعة",
          id_so: "demo_so"
        });
      }

      // Create Calendar Events
      server.create("event", {
         id: 1,
         title: "جلسة محكمة استئناف",
         date: new Date().toISOString().split('T')[0], // Today
         type: "audience"
      });
      
      let tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      server.create("event", {
         id: 2,
         title: "تبليغ حكم",
         date: tomorrow.toISOString().split('T')[0],
         type: "deadline"
      });
      
      // Phone contacts
      server.create("contact", {
         id: 1,
         name: "المحكمة الابتدائية بتونس",
         phone: "71234567",
         type: "court"
      });
      server.create("contact", {
         id: 2,
         name: "المحكمة الابتدائية بأريانة",
         phone: "71234000",
         type: "court"
      });
    },

    routes() {
      // Allow passthrough for Vite dev server and static assets
      this.passthrough((request) => {
        return !request.url.includes("/api/");
      });

      this.namespace = "api";

      // Auth
      this.post("/auth/login", (schema, request) => {
        const { username, password } = JSON.parse(request.requestBody);
        if (username === "demo" && password === "demo") {
           return { user: schema.users.first().attrs, token: "demo-jwt-token" };
        }
        return new Response(401, {}, { error: "Invalid credentials. Use demo/demo" });
      });

      this.get("/auth/verify", (schema) => {
        return { user: schema.users.first().attrs };
      });

      // Dashboard Stats
      this.get("/dashboard/stats", (schema) => {
        return {
          activeCases: schema.records.where({ status: 'in_progress' }).models.length,
          todayAppointments: schema.events.all().models.length,
          weekDeadlines: 5,
          monthCompleted: schema.records.where({ status: 'completed' }).models.length
        };
      });

      this.get("/dashboard/recent-cases", (schema) => {
        return schema.records.all().models.slice(0, 5).map(m => m.attrs);
      });

      // General Register
      this.get("/registre", (schema, request) => {
        let records = schema.records.all().models.map(m => m.attrs);
        return {
          data: records.slice(0, 50),
          total: records.length,
          page: 1,
          totalPages: 1
        };
      });

      this.get("/registre/:id", (schema, request) => {
        return schema.records.findBy({ id_r: request.params.id })?.attrs || {};
      });

      this.post("/registre", (schema, request) => {
        let attrs = JSON.parse(request.requestBody);
        let maxRef = Math.max(...schema.records.all().models.map(r => parseInt(r.ref) || 0), 1000);
        attrs.ref = maxRef + 1;
        attrs.id_r = Date.now().toString();
        attrs.status = 'has_deposit';
        return schema.records.create(attrs).attrs;
      });

      this.put("/registre/:id", (schema, request) => {
        let attrs = JSON.parse(request.requestBody);
        let record = schema.records.findBy({ id_r: request.params.id });
        if (record) {
           return record.update(attrs).attrs;
        }
        return new Response(404, {}, { error: "Not found" });
      });

      this.delete("/registre/:id", (schema, request) => {
        let record = schema.records.findBy({ id_r: request.params.id });
        if (record) {
          record.destroy();
        }
        return { success: true };
      });
      
      this.patch("/registre/:id/status", (schema, request) => {
        let { status } = JSON.parse(request.requestBody);
        let record = schema.records.findBy({ id_r: request.params.id });
        if (record) {
           record.update({ status });
        }
        return { success: true, status };
      });

      // Facturation
      this.get("/registre/facturation/list", (schema) => {
         let records = schema.records.all().models.map(m => {
            let attrs = m.attrs;
            attrs.calculated_total = attrs.salaire + attrs.tva;
            return attrs;
         });
         return { data: records, total: records.reduce((sum, r) => sum + r.calculated_total, 0), count: records.length, page: 1, totalPages: 1 };
      });

      // Other endpoints (mocked as empty or generic responses)
      this.get("/execution", () => ({ data: [], total: 0 }));
      this.get("/cnss", () => ({ data: [], total: 0 }));
      
      this.get("/calendar", (schema) => schema.events.all().models.map(m => m.attrs));
      this.post("/calendar", (schema, request) => schema.events.create(JSON.parse(request.requestBody)).attrs);
      this.delete("/calendar/:id", (schema, request) => {
         let event = schema.events.findBy({ id: request.params.id });
         if (event) event.destroy();
         return { success: true };
      });
      
      this.get("/telephone", (schema) => schema.contacts.all().models.map(m => m.attrs));
      this.post("/telephone", (schema, request) => schema.contacts.create(JSON.parse(request.requestBody)).attrs);

      this.post("/ai/chat", () => {
         return { response: "أهلاً بك في النسخة التجريبية (Demo). المساعد الذكي يعمل بكفاءة في النسخة الكاملة باستخدام Anthropic Claude API." };
      });
      
      // Ignore remaining POST/PUT/DELETE for unhandled endpoints
      this.passthrough();
    },
  });

  return server;
}
