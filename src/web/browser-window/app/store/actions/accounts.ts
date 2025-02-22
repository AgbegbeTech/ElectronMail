import {AccountConfig} from "src/shared/model/account";
import {Folder, Mail} from "src/shared/model/database";
import {ProtonPrimaryApiScan} from "src/shared/api/webview/primary";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount, WebAccountPk, WebAccountProgress} from "src/web/browser-window/app/model";
import {props, propsRecordToActionsRecord} from "src/shared/ngrx-util";

export const ACCOUNTS_ACTIONS = propsRecordToActionsRecord(
    {
        Unload: props<{ login: string, uuid: string }>(),
        UnloadRollback: props<{ uuid: string }>(),
        Select: props<{ login: string }>(),
        DeSelect: props<{ login: string }>(),
        PatchProgress: props<{ login: string; patch: WebAccountProgress; optionalAccount?: boolean; }>(),
        Patch: props<{
            login: string;
            patch: NoExtraProps<Partial<{
                [K in keyof Pick<WebAccount,
                    | "webviewSrcValues"
                    | "notifications"
                    | "syncingActivated"
                    | "loginFilledOnce"
                    | "loginDelayedSeconds"
                    | "loginDelayedUntilSelected">]: Partial<WebAccount[K]>
            }>>;
            optionalAccount?: boolean;
        }>(),
        PatchDbExportProgress: props<{ pk: WebAccountPk; uuid: string; progress?: number }>(),
        ToggleDatabaseView: props<{ login: string; forced?: Pick<WebAccount, "databaseView"> }>(),
        ToggleSyncing:
            props<{ pk: WebAccountPk; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        Synced: props<{ pk: WebAccountPk }>(),
        SetupPrimaryNotificationChannel: props<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        SetupCalendarNotificationChannel: props<{ account: WebAccount; webView: Electron.WebviewTag; finishPromise: Promise<void> }>(),
        TryToLogin: props<{ account: WebAccount; webView: Electron.WebviewTag }>(),
        WireUpConfigs: props<DeepReadonly<{ accountConfigs: AccountConfig[] }>>(),
        PatchGlobalProgress: props<{ patch: State["globalProgress"] }>(),
        SelectMailOnline:
            props<{ pk: WebAccountPk } & StrictOmit<ProtonPrimaryApiScan["ApiImplArgs"]["selectMailOnline"][0], "accountIndex">>(),
        DeleteMessages:
            props<{ pk: WebAccountPk } & StrictOmit<ProtonPrimaryApiScan["ApiImplArgs"]["deleteMessages"][0], "accountIndex">>(),
        FetchSingleMail: props<{ pk: WebAccountPk } & { mailPk: Mail["pk"] }>(),
        MakeMailRead: props<{ pk: WebAccountPk } & { messageIds: Array<Mail["id"]> }>(),
        SetMailFolder: props<{ pk: WebAccountPk } & { folderId: Folder["id"]; messageIds: Array<Mail["id"]> }>(),
    },
    {prefix: __filename},
);
