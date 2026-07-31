import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#5b5bd6",
          colorBgLayout: "#f5f6fa",
          borderRadius: 8,
          fontFamily:
            '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
          controlHeight: 36,
        },
        components: {
          Layout: {
            headerBg: "#ffffff",
            headerHeight: 56,
            bodyBg: "#f5f6fa",
          },
          Menu: {
            itemBorderRadius: 8,
            horizontalItemSelectedColor: "#5b5bd6",
          },
          Input: {
            paddingBlock: 8,
            paddingInline: 12,
          },
          Select: {
            controlHeight: 36,
          },
          Button: {
            controlHeight: 36,
            fontWeight: 560,
          },
          Card: {
            borderRadiusLG: 12,
          },
        },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
