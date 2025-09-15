const {
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
// const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

exports.onTeacherDetailsChangeV2 = onDocumentUpdated(
  "TeacherDetails/{teacherId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const teacherId = after?.TeacherId || before?.TeacherId;

    if (!before || !after) {
      console.log("Faltan datos antes o después del cambio.");
      return;
    }

    const experienceChanged = before.Experience !== after.Experience;
    const qualificationChanged = before.Qualification !== after.Qualification;

    if (!experienceChanged && !qualificationChanged) {
      console.log("No hubo cambios en Experience ni Qualification.");
      return;
    }

    console.log(`Cambios detectados en TeacherDetails/${teacherId}`);
    if (experienceChanged) {
      console.log(`- Experience: ${before.Experience} → ${after.Experience}`);
    }
    if (qualificationChanged) {
      console.log(
        `- Qualification: ${before.Qualification} → ${after.Qualification}`
      );
    }

    try {
      // Paso 1: Login para obtener el token
      const loginResponse = await axios.post(
        "https://dev.sumalink.net/webservice/WebserviceStandard/Users/Login",
        new URLSearchParams({
          userName: "info@sumalink.net",
          password: "System@s.2025",
        }),
        {
          headers: {
            "x-api-key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
          },
        }
      );

      const token = loginResponse.data.result.token;
      console.log("Token recibido:", token);

      // Paso 2: Actualizar información del docente en Sumalink
      const updateResponse = await axios.put(
        `https://dev.sumalink.net/webservice/WebserviceStandard/Teachers/Record/${teacherId}`,
        {
          experience: after.Experience,
          qualification: after.Qualification,
        },
        {
          headers: {
            "X-Api-Key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
            "Content-Type": "application/json",
            "X-TOKEN": token,
            Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
          },
        }
      );

      console.log("Actualización exitosa:", updateResponse.data);
    } catch (error) {
      console.error(
        "Error durante la llamada a la API:",
        error.response?.data || error.message
      );
    }

    return;
  }
);

exports.onAvailability = onDocumentWritten(
  "user_availability_alternate/{userId}",
  async (event) => {
    if (!event.data.after.exists) {
      console.log("📛 Documento eliminado. No se ejecuta.");
      return;
    }
    // ✅ Espera hasta que los campos necesarios existan (reintenta varias veces)
    async function waitForFields(ref, fields, retries = 5, delay = 200) {
      for (let i = 0; i < retries; i++) {
        const snap = await ref.get();
        const data = snap.data();

        const allFieldsPresent = fields.every(
          (f) => data && data[f] !== undefined
        );

        if (allFieldsPresent) {
          console.log("✅ Todos los campos requeridos encontrados.");
          return data;
        }

        console.log(`⏳ Intento ${i + 1}: Esperando campos necesarios...`);
        await new Promise((res) => setTimeout(res, delay));
      }

      throw new Error("⛔ No se encontraron todos los campos requeridos.");
    }

    const requiredFields = ["date", "status", "UserID"];
    const after = await waitForFields(event.data.after.ref, requiredFields);
    const before = event.data.before.exists ? event.data.before.data() : {};

    const userRef = after?.UserID || before?.UserID;
    const userId = typeof userRef === "string" ? userRef : userRef?.id;

    const fullDate = new Date(after.date);
    const onlyDate = fullDate.toISOString().split("T")[0];

    const dateChanged = before.date !== after.date;
    const statusChanged = before.status !== after.status;

    if (!dateChanged && !statusChanged) {
      console.log("No hubo cambios en Date.");
      return;
    }

    console.log(`Cambios detectados en user_availability_alternate/${userId}`);
    if (dateChanged) {
      console.log(`- Date: ${before.date} → ${after.date}`);
    }
    if (statusChanged) {
      console.log(`- Status: ${before.status} → ${after.status}`);
    }

    const loginResponse = await axios.post(
      "https://dev.sumalink.net/webservice/WebserviceStandard/Users/Login",
      new URLSearchParams({
        userName: "info@sumalink.net",
        password: "System@s.2025",
      }),
      {
        headers: {
          "x-api-key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
        },
      }
    );

    const token = loginResponse.data.result.token;
    console.log("Token recibido:", token);

    let getRecordExits;

    try {
      const response = await axios.get(
        `https://dev.sumalink.net/webservice/WebserviceStandard/Availability/RecordsList`,
        {
          headers: {
            "X-Api-Key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
            "Content-Type": "application/json",
            "X-TOKEN": token,
            "x-condition": JSON.stringify([
              {
                fieldName: "user_id",
                operator: "e",
                value: userId,
              },
              {
                fieldName: "date",
                operator: "e",
                value: onlyDate,
              },
            ]),
            Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
          },
        }
      );

      getRecordExits = response;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log("Registro no existe.");
        getRecordExits = null;
      } else {
        console.error(
          "Error inesperado al obtener el registro:",
          error.message
        );
        return;
      }
    }
    const records = getRecordExits.data.result.records;
    const recordIds = Object.keys(records);
    const recordId = recordIds[0];

    console.log("Record Id:", recordId);

    if (recordId === undefined) {
      const userRef =
        typeof userId === "string"
          ? admin.firestore().doc(`users/${userId}`)
          : userId;

      const teacherSnapshot = await admin
        .firestore()
        .collection("TeacherDetails")
        .where("user", "==", userRef)
        .limit(1)
        .get();

      if (teacherSnapshot.empty) {
        console.log(`No se encontró TeacherDetails para userId: ${userId}`);
        return;
      }

      const teacherData = teacherSnapshot.docs[0].data();
      const teacherId = teacherData.TeacherId; // Cambia 'nombre' por el campo que necesitas

      console.log("Nombre del profesor encontrado:", teacherId);

      try {
        const createResponse = await axios.post(
          `https://dev.sumalink.net/webservice/WebserviceStandard/Availability/Record`,
          {
            date: onlyDate,
            status_availability: after.status,
            user_id: userId,
            teacher: teacherId,
          },
          {
            headers: {
              "X-Api-Key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
              "Content-Type": "application/json",
              "X-TOKEN": token,
              Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
            },
          }
        );
        console.log("Creaciòn exitosa:", createResponse.data);
      } catch (error) {
        console.error("Error al crear el registro:", error.message);
        return;
      }
    } else {
      const updateResponse = await axios.put(
        `https://dev.sumalink.net/webservice/WebserviceStandard/Availability/Record/${recordId}`,
        {
          date: onlyDate,
          status_availability: after.status,
        },
        {
          headers: {
            "X-Api-Key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
            "Content-Type": "application/json",
            "X-TOKEN": token,
            Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
          },
        }
      );
      console.log("Actualización exitosa:", updateResponse.data);
    }

    return;
  }
);

exports.onJobFillStatus = onDocumentUpdated(
  "Job_Notifications/{userId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const userRef = after?.UserID || before?.UserID;
    const userId = typeof userRef === "string" ? userRef : userRef?.id;
    const JobUserModule = after?.JobUserModule || before?.JobUserModule;

    if (!before || !after) {
      console.log("Faltan datos antes o después del cambio.");
      return;
    }

    const jobFillStatusChanged = before.JobFillStatus !== after.JobFillStatus;

    console.log(`Cambios detectados en Job_Notifications/${userId}`);
    if (jobFillStatusChanged) {
      console.log(
        `- JobFillStatus: ${before.JobFillStatus} → ${after.JobFillStatus}`
      );
    }

    try {
      // Paso 1: Login para obtener el token
      const loginResponse = await axios.post(
        "https://dev.sumalink.net/webservice/WebserviceStandard/Users/Login",
        new URLSearchParams({
          userName: "info@sumalink.net",
          password: "System@s.2025",
        }),
        {
          headers: {
            "x-api-key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
          },
        }
      );     
      const token = loginResponse.data.result.token;
      console.log("Token recibido:", token);
      
      // Paso 2: Actualizar información del Job User Module en Sumalink
      const updateResponse = await axios.put(
        `https://dev.sumalink.net/webservice/WebserviceStandard/JobUserModule/Record/${JobUserModule}`,
        {
          status_job_user_module: after.JobFillStatus,
        },
        {
          headers: {
            "X-Api-Key": "tMCY7zxrud7ju1Rr830DS968GwtGXCUX",
            "Content-Type": "application/json",
            "X-TOKEN": token,
            Authorization: "Basic RGFuaWVsOlN5c3RlbUBzLjIwMjU=",
          },
        }
      );

      console.log("Actualización exitosa:", updateResponse.data);
    } catch (error) {
      console.error(
        "Error durante la llamada a la API:",
        error.response?.data || error.message
      );
    }

    return;
  }
);
