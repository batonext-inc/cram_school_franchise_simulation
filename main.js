import { Simulation } from "./js/simulation.js";
import { UIController } from "./js/ui.js";

const simulation = new Simulation();
const ui = new UIController({ simulation });

async function bootstrap() {
  try {
    await simulation.loadStaticData();
    ui.initialize();
  } catch (error) {
    console.error(error);
    ui.showSystemMessage("初期化に失敗しました。ページを再読み込みしてください。");
  }
}

bootstrap();
