// Import dependencies
const express = require("express");
const axios = require("axios");
const qs = require("qs");

const Stripe = require("stripe");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", __dirname);

// Utility function to pause execution
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to make API requests with retry logic
async function makeApiRequest(url, data) {
  const MAX_RETRIES = 5; // Maximum retries
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await axios.post(url, qs.stringify(data), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (error) {
      // Check for rate limit error
      if (
        error.response &&
        error.response.data.error === "Request rate per second exceeded"
      ) {
        console.warn("Rate limit exceeded. Retrying...");
        await sleep(2000); // Wait for 2 seconds before retrying
        continue; // Retry the request
      }
      throw error; // If it's another error, throw it
    }
  }
  throw new Error("Max retries exceeded");
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublicKey = process.env.STRIPE_PUBLIC_KEY;
const stripe = new Stripe(stripeSecretKey);

// Endpoint to serve the HTML file
app.get("/", (req, res) => {
  res.render(__dirname, {
    stripePublicKey: stripePublicKey,
  });
});

// Endpoint to handle form submission and create a client in Flowlu
app.post("/api/create-client", async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    billing_country,
    billing_state,
    billing_city,
    billing_zip,
    billing_address_line_1,
    billing_address_line_2,
    billing_address_line_3,
  } = req.body;

  // Hardcoded values based on your specifications
  const estimated_revenue = 999; // Required (should be a number)
  const estimated_expenses = 0; // Required (should be a number)
  const startdate = "2000-01-01"; // Required (should be in YYYY-MM-DD format)
  const enddate = "2100-01-01"; // Required (should be in YYYY-MM-DD format)
  const description = "New Order Online"; // Required description

  // Hardcoded manager_id and stage_id
  const manager_id = 1; // Replace with actual manager ID if different
  const stage_id = 1; // Replace with actual stage ID if different

  try {
    // Step 1: Create Client
    const clientResponse = await makeApiRequest(
      `https://kudio.flowlu.com/api/v1/module/crm/account/create?api_key=RmFLYnowblNWNXp5eXh6UDBPNGF5ZXdVOW1UUjdlekxfMTExMjc5`,
      {
        type: 2,
        first_name,
        last_name,
        email,
        phone,
        billing_country,
        billing_state,
        billing_city,
        billing_zip,
        billing_address_line_1,
        billing_address_line_2,
        billing_address_line_3,
      }
    );

    // Check if the client creation was successful
    if (!clientResponse.data.response) {
      throw new Error(
        "Client creation failed: " + JSON.stringify(clientResponse.data)
      );
    }

    const clientId = clientResponse.data.response.id;

    // Step 2: Create Project using the /st/projects/create endpoint
    const projectData = {
      name: "New Order", // Set project name directly
      client_id: clientId, // Link project to the created client
      customer_id: clientId, // Include customer_id to associate the project with the customer
      project_type_id: 3, // Use your project type ID (3)
      stage_id: stage_id, // Hardcoded stage ID
      manager_id: manager_id, // Hardcoded manager ID
      estimated_revenue, // Estimated revenue
      estimated_expenses, // Estimated expenses
      startdate, // Start date (YYYY-MM-DD)
      enddate, // End date (YYYY-MM-DD)
      description, // Description
    };

    // Log the data being sent to the API
    console.log("Sending Project Creation Data:", projectData);

    const projectResponse = await makeApiRequest(
      `https://kudio.flowlu.com/api/v1/module/st/projects/create?api_key=RmFLYnowblNWNXp5eXh6UDBPNGF5ZXdVOW1UUjdlekxfMTExMjc5`,
      projectData
    );

    // Check if the project creation was successful
    if (!projectResponse.data.response) {
      throw new Error(
        "Project creation failed: " + JSON.stringify(projectResponse.data)
      );
    }

    res.json({
      message: "Client and Project created successfully in Flowlu.",
      clientId: clientId,
      projectId: projectResponse.data.response.id,
    });
  } catch (error) {
    console.error(
      "Error creating client or project:",
      error.response ? error.response.data : error.message
    );
    res
      .status(500)
      .json({ error: "Failed to create client or project in Flowlu." });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
