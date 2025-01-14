import UUID from "pure-uuid";
import {BehaviorSubject, Subscription} from "rxjs";
import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output} from "@angular/core";
import type {OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import type {Unsubscribable} from "rxjs";
import {filter, first, map} from "rxjs/operators";

import {ACCOUNTS_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {State} from "src/web/browser-window/app/store/reducers/accounts";
import {WebAccount} from "src/web/browser-window/app/model";

interface ComponentState {
    account: WebAccount
    selected: boolean
    stored: boolean
    title: string
    contextMenuOpen: boolean
}

const initialComponentState: DeepReadonly<StrictOmit<ComponentState, "account">> = {
    // account: null,
    selected: false,
    stored: false,
    title: "",
    contextMenuOpen: false,
};

@Component({
    selector: "electron-mail-account-title",
    templateUrl: "./account-title.component.html",
    styleUrls: ["./account-title.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountTitleComponent implements OnInit, OnDestroy {
    @Input()
    highlighting = true;

    @Output()
    private readonly accountUnloadRollback
        = new EventEmitter<Parameters<typeof
        import("./accounts.component")["AccountsComponent"]["prototype"]["accountUnloadRollback"]>[0]>();

    private readonly stateSubject$ = new BehaviorSubject<ComponentState>({...initialComponentState} as ComponentState);

    // TODO consider replacing observable with just an object explicitly triggering ChangeDetectorRef.detectChanges() after its mutation
    // tslint:disable-next-line:member-ordering
    state$ = this.stateSubject$
        .asObservable()
        .pipe(
            filter((state) => Boolean(state.account)),
            // .pipe(debounceTime(200)),
            map((state) => {
                return {
                    ...state,
                    loginDelayed: Boolean(state.account.loginDelayedSeconds || state.account.loginDelayedUntilSelected),
                };
            }),
        );

    private accountLogin!: string;

    private subscription = new Subscription();

    @Input()
    set account(account: WebAccount) {
        this.accountLogin = account.accountConfig.login;

        this.patchState({
            account,
            stored: account.accountConfig.database,
            // TODO live attachments export: print export progress in a separate app notifications section, not inside the account button
            title: (
                (account.accountConfig.title || account.accountConfig.login)
                +
                account.dbExportProgress
                    .map((item, idx, {length}) => ` (export${length > 1 ? ` ${idx + 1}` : ""}: ${item.progress}%)`)
                    .join("")
            ),
        });
    }

    constructor(
        private readonly store: Store<State>,
        private readonly elementRef: ElementRef,
    ) {}

    ngOnInit(): void {
        if (this.highlighting) {
            this.subscription.add(
                this.store
                    .pipe(select(AccountsSelectors.FEATURED.selectedLogin))
                    .subscribe((selectedLogin) => this.patchState({selected: this.accountLogin === selectedLogin})),
            );
        }
        this.subscription.add(
            ((): Unsubscribable => {
                const target = document.body;
                const args = ["click", ({target: eventTarget}: MouseEvent) => {
                    const traversing: { el: Node | null, depthLimit: number } = {el: eventTarget as Node, depthLimit: 10};
                    const {nativeElement} = this.elementRef; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                    while (traversing.el && traversing.depthLimit) {
                        if (traversing.el === nativeElement) return;
                        traversing.el = traversing.el.parentNode;
                        traversing.depthLimit--;
                    }
                    this.patchState({contextMenuOpen: false});
                }] as const;
                target.addEventListener(...args);
                return {unsubscribe: () => target.removeEventListener(...args)};
            })(),
        );
        this.subscription.add(
            this.state$
                .pipe(first())
                .subscribe(({account: {accountConfig: {database, localStoreViewByDefault}}}) => {
                    if (database && localStoreViewByDefault) {
                        this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView(
                            {login: this.accountLogin, forced: {databaseView: true}},
                        ));
                    }
                }),
        );
    }

    @HostListener("contextmenu", ["$event"])
    onContextMenu(event: MouseEvent): void {
        if (!this.stateSubject$.value.account.accountConfig.contextMenu) {
            return;
        }
        event.preventDefault();
        this.patchState({contextMenuOpen: true});
    }

    unloadContextMenuAction(event: MouseEvent): void {
        event.preventDefault();
        const uuid = new UUID(4).format();
        this.accountUnloadRollback.emit({accountUnloadRollbackUuid: uuid});
        this.store.dispatch(ACCOUNTS_ACTIONS.Unload({login: this.stateSubject$.value.account.accountConfig.login, uuid}));
        this.patchState({contextMenuOpen: false});
    }

    toggleViewMode(event: Event): void {
        event.stopPropagation();
        this.store.dispatch(ACCOUNTS_ACTIONS.ToggleDatabaseView({login: this.accountLogin}));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private patchState(patch: Partial<ComponentState>): void {
        this.stateSubject$.next({...this.stateSubject$.value, ...patch});
    }
}
