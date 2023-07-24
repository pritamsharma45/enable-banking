"use strict";

const { create } = require("domain");
const fetch = require("node-fetch");
const { getJWT, config, input, getCode } = require("./utils");

const main = async function () {
  const JWT = getJWT();
  const BASE_URL = "https://api.enablebanking.com";
  const REDIRECT_URL = config.redirectUrl;
  const BANK_NAME = "Nordea";
  const BANK_COUNTRY = "FI";
  const baseHeaders = {
    Authorization: `Bearer ${JWT}`,
  };

  //   1.PSU want to start authorization of access. Application (i.e. API client) makes GET /aspsps request to obtain a list of available ASPSPs along with necessary meta data.
  const applicationResponse = await fetch(`${BASE_URL}/application`, {
    headers: baseHeaders,
  });

  //   Display list of ASPSPs to the PSU and let him choose one. For the sake of simplicity we will use the first one.
  console.log(`Application data: ${await applicationResponse.text()}`);

  const aspspsResponse = await fetch(`${BASE_URL}/aspsps`, {
    headers: baseHeaders,
  });
  // If you want you can override BANK_NAME and BANK_COUNTRY with any bank from this list
  console.log(`ASPSPS data: ${await aspspsResponse.text()}`);

  // 10 days ahead
  const validUntil = new Date(new Date().getTime() + 10 * 24 * 60 * 60 * 1000);
  const startAuthorizationBody = {
    access: {
      valid_until: validUntil.toISOString(),
    },
    // BANK_NAME and BANK_COUNTRY are chosen from the list of ASPSPs
    aspsp: {
      name: BANK_NAME,
      country: BANK_COUNTRY,
    },
    state: "867b92e6-d20b-4824-92b6-031f73fb2c79", // this could be anything
    redirect_url: REDIRECT_URL, // this is the url where the PSU will be redirected after authorization. here we have provided localhost:8080/auth_redirect
    psu_type: "personal",
  };
  const psuHeaders = {
    ...baseHeaders,
    "Content-Type": "application/json",
    "psu-ip-address": "10.10.10.10",
    "psu-user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:80.0) Gecko/20100101 Firefox/80.0",
  };
  const startAuthorizationResponse = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    "Content-Type": "application/json",
    Accept: "application/json",
    headers: psuHeaders,
    body: JSON.stringify(startAuthorizationBody),
  });
  const startAuthorizationData = await startAuthorizationResponse.text();
  console.log(`Start authorization data: ${startAuthorizationData}`);

  //   After we get the response from the API, we need to redirect the PSU to the url provided in the response. The PSU will be asked to authorize consent and will be redirected to the url we have provided in the request.
  // the riderect url will contain code & state parameters. Like this:- http://localhost:8080/auth_redirect?state=867b92e6-d20b-4824-92b6-031f73fb2c79&code=f7cb60b0-443a-4647-9770-b97d30866a24
  const redirectedUrl = await input(
    `Please go to ${
      JSON.parse(startAuthorizationData)["url"]
    }, authorize consent and paste here the url you have been redirected to: `
  );

  //    Here we extract the code from the redirected url params
  const createSessionBody = {
    code: getCode(redirectedUrl),
  };

  // Application makes POST /sessions request to create a session. The session is used to access the data of the PSU.
  const createSessionResponse = await fetch(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: psuHeaders,
    body: JSON.stringify(createSessionBody),
  });
  const createSessionData = await createSessionResponse.text();
  console.log(`Create session data: ${createSessionData}`);

  //   Here we will get the session id from the response that we will use to get the account balances and transactions
  const sessionId = JSON.parse(createSessionData).session_id;

  const sessionResponse = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
    headers: baseHeaders,
  });
  const sessionData = await sessionResponse.text();
  console.log(`Session data ${sessionData}`);

  //   We will use one of the accounts from the list of accounts that we get from the response in the previous step in form of sessionData
  const accountId = JSON.parse(sessionData).accounts[0];
  const accountBalancesResponse = await fetch(
    `${BASE_URL}/accounts/${accountId}/balances`,
    {
      headers: psuHeaders,
    }
  );
  console.log(`Account balances data: ${await accountBalancesResponse.text()}`);

  //   Testing anothere end point to get the account transactions for the account that we have used in the previous step
  const accountTransactionsResponse = await fetch(
    `${BASE_URL}/accounts/${accountId}/transactions`,
    {
      headers: psuHeaders,
    }
  );
  console.log(
    `Account transactions data: ${await accountTransactionsResponse.text()}`
  );
};

(async () => {
  try {
    await main();
  } catch (error) {
    console.log(`Unexpected error happened: ${error}`);
  }
})();
