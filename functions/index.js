const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
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
