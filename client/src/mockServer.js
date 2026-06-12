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
          de_part: `Petitioner ${i}`,
          nom_cl1: `Defendant ${i}`,
          date_reg: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
          status: i % 3 === 0 ? 'completed' : 'in_progress',
          salaire: (150 + i * 10),
          tva: 19,
          remarque: "Sample test file for review",
          id_so: "demo_so"
        });
      }

      // Create Calendar Events
      server.create("event", {
         id: 1,
         title: "Appeal Court Hearing",
         date: new Date().toISOString().split('T')[0], // Today
         type: "audience"
      });
      
      let tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      server.create("event", {
         id: 2,
         title: "Judgment Notification",
         date: tomorrow.toISOString().split('T')[0],
         type: "deadline"
      });
      
      // Phone contacts
      server.create("contact", {
         id: 1,
         name: "First Instance Court of Tunis",
         phone: "71234567",
         type: "court"
      });
      server.create("contact", {
         id: 2,
         name: "First Instance Court of Ariana",
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

      // Dashboard Stats — full shape consumed by Dashboard.jsx (demo data)
      this.get("/dashboard/stats", () => {
        return {
          metrics: { activeCount: 142, dueToday: 5, dueWeek: 18, completedMonth: 37 },
          recentCases: [
            { id_r: 1, ref: 2041, nom_cl1: "National Agricultural Bank", de_part: "Mohamed Ben Salah", status: "in_progress", date_echeance: "2026-06-18" },
            { id_r: 2, ref: 2039, nom_cl1: "Al Amane Insurance Co.", de_part: "Sami Ayari", status: "not_started", date_echeance: "2026-06-15" },
            { id_r: 3, ref: 2035, nom_cl1: "Al Nour Trading Co.", de_part: "Yasmine Trading LLC", status: "finished", date_echeance: "2026-06-05" },
            { id_r: 4, ref: 2030, nom_cl1: "Ali Ben Omar", de_part: "Nizar Trabelsi", status: "in_progress", date_echeance: "2026-06-22" },
            { id_r: 5, ref: 2028, nom_cl1: "Tunisian Electricity & Gas (STEG)", de_part: "Sabah Bakery", status: "not_started", date_echeance: "2026-06-13" },
            { id_r: 6, ref: 2021, nom_cl1: "National Trade Office", de_part: "Hossine Mansouri", status: "finished", date_echeance: "2026-05-29" },
            { id_r: 7, ref: 2018, nom_cl1: "Carthage Real Estate", de_part: "Imed Gharbi", status: "in_progress", date_echeance: "2026-06-20" },
            { id_r: 8, ref: 2012, nom_cl1: "Mediterranean Bank", de_part: "Olfa Ben Youssef", status: "finished", date_echeance: "2026-06-02" },
          ],
          tasksQueue: [
            { id_r: 11, ref: 2041, nom_cl1: "National Agricultural Bank", de_part: "Mohamed Ben Salah", date_echeance: "2026-06-12" },
            { id_r: 12, ref: 2028, nom_cl1: "Tunisian Electricity & Gas", de_part: "Sabah Bakery", date_echeance: "2026-06-13" },
            { id_r: 13, ref: 2039, nom_cl1: "Al Amane Insurance Co.", de_part: "Sami Ayari", date_echeance: "2026-06-15" },
          ],
          deadlines: [
            { id_even: 1, start: "2026-06-13", title: "Execution hearing", time_even: "09:30", tribunal_even: "Court of First Instance, Sousse" },
            { id_even: 2, start: "2026-06-15", title: "Writ service", time_even: "11:00", tribunal_even: "Cantonal Court, Monastir" },
            { id_even: 3, start: "2026-06-18", title: "Enforcement seizure", time_even: "14:15", tribunal_even: "Court of First Instance, Sousse" },
            { id_even: 4, start: "2026-06-22", title: "Property inspection", time_even: "10:00", tribunal_even: "Grombalia" },
          ],
          calendarDeadlines: [
            { id_even: 1, ref: 2028, nom_cl1: "Tunisian Electricity & Gas", date_echeance: "2026-06-13" },
            { id_even: 2, ref: 2039, nom_cl1: "Al Amane Insurance Co.", date_echeance: "2026-06-15" },
            { id_even: 3, ref: 2041, nom_cl1: "National Agricultural Bank", date_echeance: "2026-06-18" },
            { id_even: 4, ref: 2030, nom_cl1: "Ali Ben Omar", date_echeance: "2026-06-22" },
          ],
          payments: { expected: 85000, collected: 52300 },
          timeline: [
            { type: "case", action: "Writ created", date: "Today 14:20", title: "Execution writ #2041 — National Agricultural Bank" },
            { type: "payment", action: "Payment recorded", date: "Today 11:05", title: "Partial settlement 1,250 TND — case #2035" },
            { type: "case", action: "Status updated", date: "Yesterday 16:40", title: "Case #2030 → In Progress" },
            { type: "payment", action: "Invoice issued", date: "Yesterday 09:15", title: "Fee invoice — Al Nour Trading Co." },
          ],
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
         return { response: "Welcome to the Demo version! In the full version, this AI assistant uses the Anthropic Claude API to draft legal documents and answer complex questions." };
      });
      
      // Ignore remaining POST/PUT/DELETE for unhandled endpoints
      this.passthrough();
    },
  });

  return server;
}
