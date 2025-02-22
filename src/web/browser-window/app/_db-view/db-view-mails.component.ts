import {ChangeDetectionStrategy, Component, ElementRef, Input} from "@angular/core";
import {Observable, Subscription, combineLatest, fromEvent} from "rxjs";
import type {OnDestroy, OnInit} from "@angular/core";
import {Store, select} from "@ngrx/store";
import {distinctUntilChanged, first, map, mergeMap, tap, withLatestFrom} from "rxjs/operators";

import {ACCOUNTS_ACTIONS, DB_VIEW_ACTIONS} from "src/web/browser-window/app/store/actions";
import {AccountsSelectors} from "src/web/browser-window/app/store/selectors";
import {DB_VIEW_MAIL_DATA_PK_ATTR_NAME, DB_VIEW_MAIL_SELECTED_CLASS_NAME} from "src/web/browser-window/app/_db-view/const";
import {DbViewAbstractComponent} from "src/web/browser-window/app/_db-view/db-view-abstract.component";
import {Folder, Mail} from "src/shared/model/database/view";
import {LABEL_TYPE, SYSTEM_FOLDER_IDENTIFIERS} from "src/shared/model/database";
import {MailsBundleKey, State} from "src/web/browser-window/app/store/reducers/db-view";

// TODO read "electron-mail-db-view-mail" from the DbViewMailComponent.selector property
const mailComponentTagName = "electron-mail-db-view-mail".toUpperCase();

@Component({
    selector: "electron-mail-db-view-mails",
    templateUrl: "./db-view-mails.component.html",
    styleUrls: ["./db-view-mails.component.scss"],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbViewMailsComponent extends DbViewAbstractComponent implements OnInit, OnDestroy {
    // TODO enable iteration limit
    private static resolveMailComponentElement(element: Element | null): Element | null {
        while (element) {
            if (element.tagName === mailComponentTagName) {
                return element;
            }
            element = element.parentElement;
        }
        return null;
    }

    private static resolveMailPk(mailElement: Element): Mail["pk"] {
        const result = mailElement.getAttribute(DB_VIEW_MAIL_DATA_PK_ATTR_NAME);

        if (!result) {
            throw new Error(`Failed to resolve "pk" of mail element`);
        }

        return result;
    }

    @Input()
    mailsBundleKey!: MailsBundleKey;

    readonly mailsBundleKey$: Observable<MailsBundleKey> = this.ngChangesObservable("mailsBundleKey").pipe(
        distinctUntilChanged(),
    );

    readonly mailsBundle$ = this.mailsBundleKey$.pipe(
        mergeMap((mailsBundleKey) => this.instance$.pipe(
            map((instance) => instance[mailsBundleKey]),
            distinctUntilChanged(),
        )),
    );

    readonly plainMailsBundle$ = this.mailsBundleKey$.pipe(
        mergeMap((mailsBundleKey) => this.instance$.pipe(
            map((instance) => {
                const key = mailsBundleKey === "folderConversationsBundle"
                    ? "folderMailsBundle"
                    : mailsBundleKey;
                return instance[key];
            }),
            distinctUntilChanged(),
        )),
    );

    readonly title$ = this.mailsBundle$.pipe(
        map(({title}) => title),
        distinctUntilChanged(),
    );

    readonly items$ = this.mailsBundle$.pipe(
        map(({items}) => items),
        distinctUntilChanged(),
        tap(this.markDirty.bind(this)),
    );

    readonly plainItems$ = this.plainMailsBundle$.pipe(
        map(({items}) => items),
        distinctUntilChanged(),
        tap(this.markDirty.bind(this)),
    );

    readonly paging$ = this.mailsBundle$.pipe(
        map(({paging}) => paging),
        distinctUntilChanged(),
    );

    readonly sorting$ = this.mailsBundle$.pipe(
        map((mailsBundle) => ({sorters: mailsBundle.sorters, sorterIndex: mailsBundle.sorterIndex})),
        distinctUntilChanged(),
    );

    readonly unreadCount$: Observable<number> = this.plainItems$.pipe(
        map((items) => {
            return items.reduce(
                (acc, {mail}) => acc + Number(mail.unread),
                0,
            );
        }),
        distinctUntilChanged(),
    );

    readonly makeAllReadInProgress$: Observable<boolean> = this.account$.pipe(
        map((account) => Boolean(account.progress.makingMailRead)),
        distinctUntilChanged(),
    );

    readonly makeAllReadButtonLocked$: Observable<boolean> = combineLatest([
        this.unreadCount$,
        this.makeAllReadInProgress$,
        this.onlineAndSignedIn$,
    ]).pipe(
        map(([count, inProgress, onlineAndSignedIn]) => count < 1 || inProgress || !onlineAndSignedIn),
        distinctUntilChanged(),
    );

    readonly plainItemsCount$: Observable<number> = this.plainItems$.pipe(
        map(({length}) => length),
        distinctUntilChanged(),
    );

    readonly setFolderInProgress$: Observable<boolean> = this.account$.pipe(
        map((account) => Boolean(account.progress.settingMailFolder)),
    );

    readonly setFolderButtonLocked$: Observable<boolean> = combineLatest([
        this.plainItemsCount$,
        this.setFolderInProgress$,
        this.onlineAndSignedIn$,
    ]).pipe(
        map(([count, inProgress, onlineAndSignedIn]) => count < 1 || inProgress || !onlineAndSignedIn),
        distinctUntilChanged(),
    );

    readonly deletingMessagesInProgress$: Observable<boolean> = this.account$.pipe(
        map((account) => Boolean(account.progress.deletingMessages)),
        distinctUntilChanged(),
    );

    readonly deletingMessagesButtonLocked$: Observable<boolean> = combineLatest([
        this.plainItemsCount$,
        this.deletingMessagesInProgress$,
        this.onlineAndSignedIn$,
    ]).pipe(
        map(([count, inProgress, onlineAndSignedIn]) => count < 1 || inProgress || !onlineAndSignedIn),
        distinctUntilChanged(),
    );

    readonly moveToFolders$: Observable<Folder[]> = (
        () => { // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
            const excludeIds: ReadonlySet<Folder["id"]> = new Set([
                SYSTEM_FOLDER_IDENTIFIERS["Virtual Unread"],
                SYSTEM_FOLDER_IDENTIFIERS["All Drafts"],
                SYSTEM_FOLDER_IDENTIFIERS["All Sent"],
                SYSTEM_FOLDER_IDENTIFIERS["All Mail"],
                SYSTEM_FOLDER_IDENTIFIERS.Search,
                SYSTEM_FOLDER_IDENTIFIERS.Label,
            ]);
            const staticFilter = ({id, type}: Folder): boolean => {
                return (
                    type === LABEL_TYPE.MESSAGE_FOLDER
                    &&
                    !excludeIds.has(id)
                );
            };
            return combineLatest([
                this.instance$.pipe(
                    map((value) => value.folders),
                    distinctUntilChanged(),
                    map(({custom, system}) => ([...system, ...custom])),
                    map((items) => items.filter(staticFilter)),
                ),
                this.instance$.pipe(
                    map((value) => value.selectedFolderData),
                    distinctUntilChanged(),
                ),
            ]).pipe(
                map(([items, selectedFolderData]) => {
                    const excludeFolderId = this.mailsBundleKey === "searchMailsBundle"
                        ? null // no excluding for the full-text search result lit
                        : selectedFolderData?.id;
                    return items.filter(({id}) => id !== excludeFolderId);
                }),
            );
        }
    )();

    private subscription = new Subscription();

    private _uid?: string;

    @Input()
    set uid(value: string | undefined) {
        if (this._uid && this._uid !== value) {
            this.store.dispatch(DB_VIEW_ACTIONS.Paging({
                webAccountPk: this.webAccountPk,
                mailsBundleKey: this.mailsBundleKey,
                reset: true,
            }));
        }
        this._uid = value;
    }

    constructor(
        private elementRef: ElementRef<Element>,
        store: Store<State>,
    ) {
        super(store);
    }

    ngOnInit(): void {
        // TODO use @HostListener approach as soon as https://github.com/angular/angular/issues/19878 gets resolved
        this.subscription.add(
            fromEvent<MouseEvent>(this.elementRef.nativeElement, "click").subscribe((event) => {
                const target = event.target as Element;
                const mailElement = DbViewMailsComponent.resolveMailComponentElement(target);

                if (!mailElement) {
                    return;
                }

                const mailPk: Mail["pk"] | null = mailElement.getAttribute("data-pk");

                if (mailPk) {
                    this.store.dispatch(DB_VIEW_ACTIONS.SelectMailRequest({webAccountPk: this.webAccountPk, mailPk}));
                }
            }),
        );

        this.subscription.add(
            fromEvent<KeyboardEvent>(document, "keydown")
                .pipe(
                    withLatestFrom(
                        this.store.pipe(
                            select(AccountsSelectors.FEATURED.selectedLogin),
                        ),
                    )
                )
                .subscribe(([{keyCode}, selectedLogin]) => {
                    // only processing keydown event on selected account
                    // (subscribed globally / to document)
                    if (this.webAccountPk.login !== selectedLogin) {
                        // WARN only one mails list component instance should to be rendered per account
                        // (subscribed globally / to document)
                        return;
                    }

                    const up = keyCode === 38;
                    const down = keyCode === 40;

                    if (!up && !down) {
                        return;
                    }

                    // TODO cache "selected" element on selection change
                    const selected = this.resolveSelectedMailElement();

                    if (!selected) {
                        // TODO cache ":first-of-type" element on rendered mails list change
                        const firstMail = this.elementRef.nativeElement.querySelector(`${mailComponentTagName}:first-of-type`);

                        if (firstMail) {
                            // selecting first mail if none has been selected before
                            this.store.dispatch(
                                DB_VIEW_ACTIONS.SelectMailRequest({
                                    webAccountPk: this.webAccountPk,
                                    mailPk: DbViewMailsComponent.resolveMailPk(firstMail),
                                }),
                            );
                        }

                        return;
                    }

                    const toSelect: ChildNode | ElementRef | null = up
                        ? selected.previousSibling
                        : selected.nextSibling;

                    if (!toSelect) {
                        return;
                    }

                    if (
                        up
                        &&
                        // TODO cache ":first-of-type" element on rendered mails list change
                        selected === this.elementRef.nativeElement.querySelector(`${mailComponentTagName}:first-of-type`)
                    ) {
                        return;
                    }

                    if (
                        down
                        &&
                        // TODO cache ":last-of-type" element on rendered mails list change
                        selected === this.elementRef.nativeElement.querySelector(`${mailComponentTagName}:last-of-type`)
                    ) {
                        return;
                    }

                    // TODO TS: use type-guard function to resolve/narrow Node as Element
                    if (
                        toSelect.nodeType !== Node.ELEMENT_NODE
                        ||
                        (toSelect as Element).tagName !== mailComponentTagName
                    ) {
                        throw new Error("Failed to resolve sibling mail element");
                    }

                    this.store.dispatch(
                        DB_VIEW_ACTIONS.SelectMailRequest({
                            webAccountPk: this.webAccountPk,
                            mailPk: DbViewMailsComponent.resolveMailPk(toSelect as Element),
                        }),
                    );
                }),
        );

        this.subscription.add(
            this.instance$.pipe(
                map((value) => value.selectedMail),
                distinctUntilChanged(),
            ).subscribe((selectedMail) => {
                const toDeselect = this.resolveSelectedMailElement();
                const toSelect: Element | null = selectedMail
                    ? this.elementRef.nativeElement
                        .querySelector(`${mailComponentTagName}[${DB_VIEW_MAIL_DATA_PK_ATTR_NAME}='${selectedMail.listMailPk}']`)
                    : null;

                if (toDeselect) {
                    toDeselect.classList.remove(DB_VIEW_MAIL_SELECTED_CLASS_NAME);
                }
                if (toSelect) {
                    toSelect.classList.add(DB_VIEW_MAIL_SELECTED_CLASS_NAME);
                }
            }),
        );

        this.subscription.add(
            this.mailsBundleKey$.subscribe(() => {
                this.store.dispatch(DB_VIEW_ACTIONS.Paging({
                    webAccountPk: this.webAccountPk,
                    mailsBundleKey: this.mailsBundleKey,
                    reset: true,
                }));
            }),
        );
    }

    sortChange(sorterIndex: number): void {
        this.store.dispatch(DB_VIEW_ACTIONS.SortMails({
            webAccountPk: this.webAccountPk,
            mailsBundleKey: this.mailsBundleKey,
            sorterIndex: Number(sorterIndex),
        }));
    }

    loadMore(): void {
        this.store.dispatch(DB_VIEW_ACTIONS.Paging({webAccountPk: this.webAccountPk, mailsBundleKey: this.mailsBundleKey}));
    }

    trackByMailBundleItem(
        ...[, {mail: {pk}}]: readonly [number, Unpacked<Unpacked<typeof DbViewMailsComponent.prototype.items$>>]
    ): string {
        return pk;
    }

    deleteMessages(): void {
        this.resolveSinglePlainItemsAndPkNotification().subscribe(([items, pk]) => {
            const messageIds = items.map((item) => item.mail.id);
            if (!messageIds.length) {
                return;
            }
            if (
                !confirm(`Are you sure you want to permanently delete ${messageIds.length} message${messageIds.length > 1 ? "s" : ""}?`)
            ) {
                return;
            }
            this.store.dispatch(
                ACCOUNTS_ACTIONS.DeleteMessages({pk, messageIds}),
            );
        });
    }

    makeAllRead(): void {
        this.resolveSinglePlainItemsAndPkNotification().subscribe(([items, pk]) => {
            const messageIds = items
                .filter((item) => item.mail.unread)
                .map((item) => item.mail.id);
            if (messageIds.length) {
                this.store.dispatch(
                    ACCOUNTS_ACTIONS.MakeMailRead({pk, messageIds}),
                );
            }
        });
    }

    setFolder(folderId: Folder["id"]): void {
        this.resolveSinglePlainItemsAndPkNotification().subscribe(([items, pk]) => {
            const messageIds = items.map((item) => item.mail.id);
            if (messageIds.length) {
                this.store.dispatch(
                    ACCOUNTS_ACTIONS.SetMailFolder({pk, folderId, messageIds}),
                );
            }
        });
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        this.subscription.unsubscribe();
    }

    private resolveSinglePlainItemsAndPkNotification() { // eslint-disable-line @typescript-eslint/explicit-function-return-type
        return this.plainItems$.pipe(
            withLatestFrom(this.webAccountPk$),
            first(),
        );
    }

    private resolveSelectedMailElement(): Element | null {
        return (this.elementRef.nativeElement)
            .querySelector(`${mailComponentTagName}.${DB_VIEW_MAIL_SELECTED_CLASS_NAME}`);
    }
}
