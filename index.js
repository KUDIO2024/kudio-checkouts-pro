// Import dependencies
const express = require("express");
const axios = require("axios");
const qs = require("qs");
const dayjs = require("dayjs");
const util = require("util");

const Stripe = require("stripe");
const dotenv = require("dotenv");

let clientId = 0;
let projectId = 0;
let clientName = "";
let grandTotal = 0;

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
  res.render("index_new", {
    stripePublicKey: stripePublicKey,
  });
});

app.post("/api/create-invoice", async (req, res) => {
  const statusId = req.body.status_id;
  const invoiceResponse = await createInvoice(
    clientId,
    projectId,
    statusId,
    grandTotal,
    clientName
  );
  console.log("Invoice created", invoiceResponse);
});

app.post("/api/test-api", async (req, res) => {
  const taskResponse = await makeApiRequest(
    `https://kudio.flowlu.com/api/v1/module/task/tasks/list?api_key=RmFLYnowblNWNXp5eXh6UDBPNGF5ZXdVOW1UUjdlekxfMTExMjc5&page=11`
  );

  if (!taskResponse.data.response) {
    throw new Error(
      "Task creation failed: " + JSON.stringify(taskResponse.data)
    );
  }

  const today = dayjs().format("YYYY-MM-DD");
  console.log("Today's date: ", typeof today);

  res.json(taskResponse.data);
});

// Endpoint to handle form submission and create a client in Flowlu
app.post("/api/create-client", async (req, res) => {
  // console.log(req.body);
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

  grandTotal = req.body.grandTotal;
  let description = "";
  console.log("total price: ", grandTotal);
  if (grandTotal == 465) {
    description =
      "Customer selected monthly option for Lite Hosting £15 and Website Development £450";
  } else if (grandTotal == 519) {
    description =
      "Customer selected monthly option for Lite Hosting £150 and Website Development £369";
  }
  console.log("Description: " + description);
  clientName = first_name + " " + last_name;
  const today = dayjs().format("YYYY-MM-DD");
  console.log("today's date: " + today);

  const estimated_revenue = grandTotal;
  const estimated_expenses = 0;
  const startdate = today;
  const enddate = today;
  const manager_id = 1;
  const stage_id = 1;

  try {
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

    if (!clientResponse.data.response) {
      throw new Error(
        "Client creation failed: " + JSON.stringify(clientResponse.data)
      );
    }

    clientId = clientResponse.data.response.id;
    console.log("=========> clientId=" + clientId);

    const projectData = {
      name: "New Order",
      customer_id: clientId,
      project_type_id: 3,
      stage_id: stage_id,
      manager_id: manager_id,
      estimated_revenue,
      estimated_expenses,
      startdate,
      enddate,
      description,
    };

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
    projectId = projectResponse.data.response.id;

    const taskData = {
      name: "NEW ORDER",
      description,
      start_date: today,
      closed_date: today,
      priority: 1,
      crm_account_id: clientId,
      type: 0,
      project_stage_id: projectId,
      plan_start_date: today,
      plan_end_date: today,
      project_checkitem_id: projectId,
      project_id: projectId,
    };

    const taskResponse = await makeApiRequest(
      `https://kudio.flowlu.com/api/v1/module/task/tasks/create?api_key=RmFLYnowblNWNXp5eXh6UDBPNGF5ZXdVOW1UUjdlekxfMTExMjc5`,
      taskData
    );

    if (!taskResponse.data.response) {
      throw new Error("Task creation failed: " + JSON.stringify(task.data));
    }

    console.log("task create result: ", taskResponse.data);

    // console.log("project response: ", projectResponse.data);
    // console.log("=========> projectId=" + projectId);
    // console.log("grand total and cliend name: ", grandTotal, clientName);
    // const statusId = 10;

    // const invoiceResponse = await createInvoice(
    //   clientId,
    //   projectId,
    //   statusId,
    //   grandTotal,
    //   clientName
    // );
    // console.log("Invoice created: " + invoiceResponse);

    res.json({
      message: "Client and Project created successfully in Flowlu.",
      clientId: clientId,
      projectId: projectId,
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

async function createInvoice(
  clientId,
  projectId,
  statusId,
  grandTotal,
  clientName
) {
  const lastInvoiceNumber = await getLastInvoiceNumber();
  const today = dayjs().format("YYYY-MM-DD");

  const invoiceData = {
    active: 1,
    customer_id: clientId,
    model_id: projectId,
    invoice_number: lastInvoiceNumber + 1,
    invoice_number_print: "KDG" + (lastInvoiceNumber + 1),
    customer_name: clientName,
    note: "Invoice for website and development",
    contact_person: "",
    invoice_date: today,
    due_date: today,
    status_id: statusId,
    currency_id: 1,
    sub_total: grandTotal,
    tax_total: 0,
    total: grandTotal,
    template_id: 222,
    template_name: "test",
    default_organization: 1,
  };

  try {
    const invoiceResponse = await makeApiRequest(
      `https://kudio.flowlu.com/api/v1/module/fin/invoice/create?api_key=RmFLYnowblNWNXp5eXh6UDBPNGF5ZXdVOW1UUjdlekxfMTExMjc5`,
      invoiceData
    );

    if (!invoiceResponse.data.response) {
      console.error("Invoice creation response error:", invoiceResponse.data);
      throw new Error(
        "Invoice creation failed: " + JSON.stringify(invoiceResponse.data)
      );
    }

    console.log("Invoice created successfully:", invoiceResponse.data);

    return {
      message: "Invoice created successfully within the project in Flowlu.",
      invoiceId: invoiceResponse.data.response.id,
    };
  } catch (error) {
    console.error(
      "Error creating invoice:",
      error.response ? error.response.data : error.message
    );
    return { error: "Failed to create invoice in Flowlu." };
  }
}

app.post("/api/process-payment", async (req, res) => {
  const { paymentMethod, totalPrice } = req.body;

  console.log("=================> create payment intent ", req.body);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalPrice * 100,
      currency: "gbp",
      payment_method: paymentMethod.id,
      confirm: true,
      metadata: { country: "GB" },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    console.log("============> Payment Intent: ", paymentIntent);

    if (paymentIntent.status === "requires_action") {
      res.json({ clientSecret: paymentIntent.client_secret });
    } else {
      res.json({ error: "Payment intent failed." });
    }
  } catch (error) {
    console.log("Error creating payment intent:", error);
    res.status(500).json({ error: "Payment processing failed." });
  }
});

async function getLastInvoiceNumber() {
  let page = 1;
  let invoiceList = await getInvoiceListPerPage(page);
  if (!invoiceList) {
    res.status(500).json({ error: "Failed to fetch invoice list." });
    return;
  }
  let pageNum = Math.ceil(invoiceList.total / invoiceList.count);
  let lastInvoiceNumber = 0;
  while (pageNum) {
    invoiceList = await getInvoiceListPerPage(pageNum);
    pageNum = pageNum - 1;
    let len = invoiceList.items.length;
    for (let i = len - 1; i >= 0; i--) {
      if (invoiceList.items[i].invoice_number_print.startsWith("KDG")) {
        lastInvoiceNumber = invoiceList.items[i].invoice_number;
        break;
      }
    }
    if (lastInvoiceNumber) break;
  }
  console.log("Last invoice number found: ", lastInvoiceNumber);
  return lastInvoiceNumber;
}

async function getInvoiceListPerPage(page) {
  try {
    const invoiceResponse = await makeApiRequest(
      `https://kudio.flowlu.com/api/v1/module/fin/invoice/list?api_key=RmFLYnowblNWNXp5eXh6UDBPNGF5ZXdVOW1UUjdlekxfMTExMjc5&page=${page}`
    );

    if (!invoiceResponse.data.response) {
      console.error("Invoice list response error:", invoiceResponse.data);
      throw new Error(
        "Failed to fetch invoice list: " + JSON.stringify(invoiceResponse.data)
      );
    }

    const pageInvoices = invoiceResponse.data.response;
    // console.log("Invoice list", pageInvoices);~
    return pageInvoices;
  } catch (e) {
    return null;
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
