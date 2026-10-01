import { parentPort, workerData } from "node:worker_threads";
import { verifyCampaignSolutions } from "./verify-campaign.js";

parentPort.postMessage(verifyCampaignSolutions(workerData.payload, workerData.campaign));
