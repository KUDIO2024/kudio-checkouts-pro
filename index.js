// Import dependencies
const express = require("express");
const axios = require("axios");
const qs = require("qs");
const dayjs = require("dayjs");
const util = require("util");
const crypto = require("crypto");

const constants = {
  urls: {
    domainAvailability: "https://reseller-api.ds.network/domains/availability",
    domainResistrant: "https://reseller-api.ds.network/domains/registrants",
    getDomainList: "https://reseller-api.ds.network/domains",
    domainRegister: "https://reseller-api.ds.network/domains",
    customerRegister: "https://reseller-api.ds.network/customers",
    emailPackageRegister:
      "https://reseller-api.ds.network/products/email-hostings",
  },
};

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
const apiKey = process.env.API_KEY;
const resellerId = process.env.RESELLER_ID;
const domainTypes = ["co.uk", "com", "org", "org.uk", "uk"];

// Endpoint to serve the HTML file
app.get("/", (req, res) => {
  res.render("index_new", {
    stripePublicKey: stripePublicKey,
  });
});

function generateRequestID() {
  return crypto
    .createHash("md5")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex");
}

function generateSignature(requestId, apiKey) {
  return crypto
    .createHash("md5")
    .update(requestId + apiKey)
    .digest("hex");
}

app.get("/domain-availability", async (req, res) => {
  const domain = req.query.domain;

  if (!domain) {
    return res.status(400).json({ error: "Domain name is required" });
  }

  try {
    const domainName = domain.split(".")[0]; // Extract base domain name
    const requestId = generateRequestID();
    const signature = generateSignature(requestId, apiKey);

    let url = constants.urls.domainAvailability + "?";

    const domainQueries = domainTypes.map(
      (type) => `domain_names[]=${domainName}.${type}`
    );
    url += domainQueries.join("&");
    url += "&currency=GBP";

    console.log("==============> Request URL:", url); // Log URL for debugging

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Api-Request-Id": requestId,
        "Api-Signature": signature,
        "Reseller-ID": resellerId,
        accept: "application/json",
      },
    });

    const data = await response.json();
    console.log("============> Dreamscape API Response:", data); // Log API response for debugging

    if (data && Array.isArray(data.data)) {
      res.status(200).json({ data: data.data });
    } else {
      res.status(200).json({ data: [] }); // Empty array if no data
    }
  } catch (error) {
    console.error("=============> Error fetching domain availability:", error);
    res.status(500).json({ error: "Failed to fetch domain availability" });
  }
});

app.post("/registrant", async (req, res) => {
  const data = req.body;

  console.log("=================> customer data: ", data);

  try {
    const response = await registerCustomer(data);
    console.log("=================> Customer Registration Result: ", response);
    // if (customerId) {
    //   try {
    // const registrantId = await createRegistration(data);

    if (response.status) {
      const customerId = response.data.id;
      const username = response.data.username;
      res.status(200).json({
        status: true,
        customer: customerId,
        username,
      });
    } else {
      res.status(200).json({
        status: false,
        error: response.validation_errors
          ? response.validation_errors
          : response.error_message,
      });
    }

    // } catch (error) {
    //   console.error("Error registering registrant:", error);
    // }
    // }
  } catch (error) {
    console.error("Error registering customer:", error);
    res.status(500).json({ error: "Failed to register registrant." });
  }
});

app.post("/register-domain", async (req, res) => {
  const { domain, customer_id, plan_id } = req.body;

  const response = await registerDomain(domain, customer_id, plan_id);

  // domainRegisterResult = await response.json();
  console.log(
    "===========> register status and error ",
    response.status,
    response.error
  );
  res.json(response);
});

async function registerDomain(domain, customerId, plan_id) {
  console.log(
    "=================> registering domain & customerID: ",
    domain,
    customerId
  );

  const registerUrl = constants.urls.domainRegister;
  const emailHostingUrl = constants.urls.emailPackageRegister;

  const requestId = generateRequestID();
  const signature = generateSignature(requestId, apiKey);
  try {
    const domainResponse = await fetch(registerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "Api-Request-Id": requestId,
        "Api-Signature": signature,
      },
      body: JSON.stringify({
        domain_name: domain,
        customer_id: customerId,
        period: 12,
      }),
    });
    const domainData = await domainResponse.json();
    console.log("============> domainData API Response:", domainData); // Log API response for debugging

    if (domainData.status && plan_id) {
      if (domainData.data.status_id == 1 || domainData.data.status_id == 2) {
        const new_requestId = generateRequestID();
        const new_signature = generateSignature(new_requestId, apiKey);

        console.log(
          "new request ID and signature =========> ",
          new_requestId,
          new_signature
        );

        try {
          const emailHostingResponse = await fetch(emailHostingUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              "Api-Request-Id": new_requestId,
              "Api-Signature": new_signature,
            },
            body: JSON.stringify({
              domain_name: domain,
              plan_id: plan_id,
              customer_id: customerId,
              period: 12,
            }),
          });
          const emailHostingData = await emailHostingResponse.json();
          console.log(
            "============> emailHostingData API Response:",
            emailHostingData
          ); // Log API response for debugging

          if (emailHostingData.status === true) {
            if (
              emailHostingData.data.status_id == 1 ||
              emailHostingData.data.status_id == 2
            ) {
              return { status: true, error: "" };
            } else
              return {
                status: false,
                error:
                  "Succeeded to register domain but Failed to register email hosting. Please confirm if you provide right information.",
              };
          } else
            return {
              status: false,
              error:
                "Succeeded to register domain but Failed to register email hosting. " +
                emailHostingData.error_message,
            };
        } catch (error) {
          console.error("Error registering email hosting:", error);
          return {
            status: false,
            error:
              "Succeeded to register domain but Failed to register email hosting.",
          };
        }
      } else {
        return {
          status: false,
          error: "An error occured in registering domain and email hosting",
        };
      }
    } else if (domainData.status === false) {
      return {
        status: false,
        error:
          "An error occured in registering domain and email hosting " +
          domainData.error_message,
      };
    }
  } catch (error) {
    console.error("Error registering domain:", error);
    return {
      status: false,
      error: "Failed to register domain and email hosting",
    };
  }
}

async function registerCustomer(registrantData) {
  const requestId = generateRequestID();
  const signature = generateSignature(requestId, apiKey);

  const customerUrl = constants.urls.customerRegister;

  try {
    const customerResponse = await fetch(customerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "Api-Request-Id": requestId,
        "Api-Signature": signature,
        "Reseller-ID": resellerId,
      },
      body: JSON.stringify(registrantData),
    });

    const customerResult = await customerResponse.json();

    if (customerResult.status) {
      console.log(
        "============> Customer registered successfully ",
        customerResult
      );
      return customerResult;
    } else {
      // throw new Error(customerResult.error_message);
      console.log(
        "============> Customer registration failed ",
        customerResult
      );
      return customerResult;
    }
  } catch (error) {
    console.error("Error registering customer:", error);
    throw new Error("Failed to register customer");
  }
}

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
